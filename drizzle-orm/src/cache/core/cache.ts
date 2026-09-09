import { entityKind } from '~/entity.ts';
import type { Table } from '~/table.ts';
import type { CacheConfig, WithCacheConfig } from './types.ts';

export abstract class Cache {
	static readonly [entityKind]: string = 'Cache';

	abstract strategy(): 'explicit' | 'all';

	/**
	 * Invoked if we should check cache for cached response
	 * @param sql
	 * @param tables
	 */
	abstract get(
		key: string,
		tables: string[],
		isTag: boolean,
		isAutoInvalidate?: boolean,
	): Promise<any[] | undefined>;

	/**
	 * Invoked if new query should be inserted to cache
	 * @param sql
	 * @param tables
	 */
	abstract put(
		hashedQuery: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Promise<void>;

	/**
	 * Invoked if insert, update, delete was invoked
	 * @param tables
	 */
	abstract onMutate(
		params: MutationOption,
	): Promise<void>;
}

export class NoopCache extends Cache {
	static override readonly [entityKind]: string = 'NoopCache';

	override strategy() {
		return 'all' as const;
	}

	override async get(_key: string): Promise<any[] | undefined> {
		return undefined;
	}
	override async put(
		_hashedQuery: string,
		_response: any,
		_tables: string[],
		_config?: any,
	): Promise<void> {
		// noop
	}
	override async onMutate(_params: MutationOption): Promise<void> {
		// noop
	}
}

// TODO: one place for all dialects
export const strategyFor = async (
	query: string,
	params: any[] | undefined,
	queryMetadata: {
		type: 'select' | 'update' | 'delete' | 'insert';
		tables: string[];
	} | undefined,
	withCacheConfig?: WithCacheConfig,
) => {
	if (!queryMetadata) return { type: 'skip' as const };

	const { type, tables } = queryMetadata;

	if ((type === 'insert' || type === 'update' || type === 'delete') && tables.length > 0) {
		return { type: 'invalidate' as const, tables };
	}

	if (!withCacheConfig) return { type: 'skip' as const };
	if (!withCacheConfig.enabled) return { type: 'skip' as const };

	if (type === 'select') {
		const tag = withCacheConfig.tag ?? await hashQuery(query, params);

		return {
			type: 'try' as const,
			key: tag,
			isTag: typeof withCacheConfig.tag !== 'undefined',
			autoInvalidate: withCacheConfig.autoInvalidate,
			tables: queryMetadata.tables,
			config: withCacheConfig.config,
		};
	}
	return { type: 'skip' as const };
};

export type MutationOption = { tags?: string | string[]; tables?: Table<any> | Table<any>[] | string | string[] };

const SHA256_K = /* @__PURE__ */ new Uint32Array([
	0x428a2f98,
	0x71374491,
	0xb5c0fbcf,
	0xe9b5dba5,
	0x3956c25b,
	0x59f111f1,
	0x923f82a4,
	0xab1c5ed5,
	0xd807aa98,
	0x12835b01,
	0x243185be,
	0x550c7dc3,
	0x72be5d74,
	0x80deb1fe,
	0x9bdc06a7,
	0xc19bf174,
	0xe49b69c1,
	0xefbe4786,
	0x0fc19dc6,
	0x240ca1cc,
	0x2de92c6f,
	0x4a7484aa,
	0x5cb0a9dc,
	0x76f988da,
	0x983e5152,
	0xa831c66d,
	0xb00327c8,
	0xbf597fc7,
	0xc6e00bf3,
	0xd5a79147,
	0x06ca6351,
	0x14292967,
	0x27b70a85,
	0x2e1b2138,
	0x4d2c6dfc,
	0x53380d13,
	0x650a7354,
	0x766a0abb,
	0x81c2c92e,
	0x92722c85,
	0xa2bfe8a1,
	0xa81a664b,
	0xc24b8b70,
	0xc76c51a3,
	0xd192e819,
	0xd6990624,
	0xf40e3585,
	0x106aa070,
	0x19a4c116,
	0x1e376c08,
	0x2748774c,
	0x34b0bcb5,
	0x391c0cb3,
	0x4ed8aa4a,
	0x5b9cca4f,
	0x682e6ff3,
	0x748f82ee,
	0x78a5636f,
	0x84c87814,
	0x8cc70208,
	0x90befffa,
	0xa4506ceb,
	0xbef9a3f7,
	0xc67178f2,
]);

function rotr(x: number, n: number): number {
	return (x >>> n) | (x << (32 - n));
}

function sha256(bytes: Uint8Array): Uint8Array {
	const h = new Uint32Array([
		0x6a09e667,
		0xbb67ae85,
		0x3c6ef372,
		0xa54ff53a,
		0x510e527f,
		0x9b05688c,
		0x1f83d9ab,
		0x5be0cd19,
	]);

	const byteLength = bytes.length;
	const padded = new Uint8Array(Math.ceil((byteLength + 9) / 64) * 64);
	padded.set(bytes);
	padded[byteLength] = 0x80;

	const view = new DataView(padded.buffer);
	const bitLength = byteLength * 8;
	view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
	view.setUint32(padded.length - 4, bitLength >>> 0);

	const w = new Uint32Array(64);

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
		for (let i = 16; i < 64; i++) {
			const a0 = w[i - 15]!;
			const a1 = w[i - 2]!;
			const s0 = rotr(a0, 7) ^ rotr(a0, 18) ^ (a0 >>> 3);
			const s1 = rotr(a1, 17) ^ rotr(a1, 19) ^ (a1 >>> 10);
			w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
		}

		let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;

		for (let i = 0; i < 64; i++) {
			const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (hh + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
			const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (s0 + maj) >>> 0;

			hh = g;
			g = f;
			f = e;
			e = (d + t1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) >>> 0;
		}

		h[0] = h[0]! + a;
		h[1] = h[1]! + b;
		h[2] = h[2]! + c;
		h[3] = h[3]! + d;
		h[4] = h[4]! + e;
		h[5] = h[5]! + f;
		h[6] = h[6]! + g;
		h[7] = h[7]! + hh;
	}

	const out = new Uint8Array(32);
	const outView = new DataView(out.buffer);
	for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!);
	return out;
}

const HEX = /* @__PURE__ */ (() => {
	const table = new Array<string>(256);
	for (let i = 0; i < 256; i++) table[i] = i.toString(16).padStart(2, '0');
	return table;
})();

function toHex(bytes: Uint8Array): string {
	let hex = '';
	for (let i = 0; i < bytes.length; i++) hex += HEX[bytes[i]!];
	return hex;
}

type NodeCreateHash = (algorithm: string) => {
	update(data: string): { digest(encoding: 'hex'): string };
};

let nodeCreateHash: NodeCreateHash | null | undefined;

function getNodeCreateHash(): NodeCreateHash | null {
	if (nodeCreateHash !== undefined) return nodeCreateHash;

	let resolved: NodeCreateHash | null;
	try {
		const nodeCrypto = (globalThis as any).process?.getBuiltinModule?.('node:crypto');
		resolved = typeof nodeCrypto?.createHash === 'function' ? nodeCrypto.createHash : null;
	} catch {
		resolved = null;
	}

	return (nodeCreateHash = resolved);
}

let encoder: TextEncoder | undefined;

export async function hashQuery(sql: string, params?: any[]) {
	const dataToHash = `${sql}-${JSON.stringify(params, (_, v) => typeof v === 'bigint' ? `${v}n` : v)}`;

	const createHash = getNodeCreateHash();
	if (createHash) return createHash('sha256').update(dataToHash).digest('hex');

	encoder ??= new TextEncoder();
	const data = encoder.encode(dataToHash);

	const subtle = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : undefined;

	return toHex(subtle ? new Uint8Array(await subtle.digest('SHA-256', data)) : sha256(data));
}
