import { is } from './entity.ts';
import { Placeholder } from './sql/sql.ts';

function isBinary(value: unknown): boolean {
	if (
		typeof Buffer !== 'undefined'
		&& typeof Buffer.isBuffer === 'function'
		&& Buffer.isBuffer(value)
	) return true;
	// oxlint-disable-next-line drizzle-internal/no-instanceof
	if (value instanceof ArrayBuffer) return true;
	if (ArrayBuffer.isView(value)) return true;
	return false;
}

function arrayTypeId(arr: readonly unknown[]) {
	if (!arr.length) return 'array<void>';
	let elementId: string | undefined;
	for (let i = 0; i < arr.length; i++) {
		const id = jsTypeId(arr[i]);

		if (!elementId) {
			elementId = id;
			continue;
		}

		if (elementId !== id) {
			elementId = `${elementId},${id}`;
			continue;
		}

		elementId = id;
	}
	return `array<${elementId}>`;
}

// replacement for type OID
function jsTypeId(value: unknown): string {
	if (value === null) return 'null';
	if (is(value, Placeholder)) return 'placeholder';
	// oxlint-disable-next-line drizzle-internal/no-instanceof
	if (value instanceof Date) return 'date';
	if (Array.isArray(value)) return arrayTypeId(value);
	if (isBinary(value)) return 'binary';
	return typeof value;
}

function rotl(x: number, r: number): number {
	return (x << r) | (x >>> (32 - r));
}

function fmix32(h: number): number {
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h >>> 0;
}

const safeChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
function encodeLane(h: number): string {
	let result = '';
	for (let i = 0; i < 6; i++) {
		result += safeChars[h % 62];
		h = (h / 62) | 0;
	}
	return result;
}

// `encodeLane` starting with letter to emit valid identifier
function encodeLeadLane(h: number): string {
	let result = safeChars[h % 52]!;
	h = (h / 52) | 0;
	for (let i = 0; i < 5; i++) {
		result += safeChars[h % 62];
		h = (h / 62) | 0;
	}
	return result;
}

export function preparedStatementName(
	sql: string,
	params: readonly unknown[] = [],
): string {
	let paramIds = '';
	for (let i = 0; i < params.length; i++) {
		if (i) paramIds += ',';
		paramIds += jsTypeId(params[i]);
	}

	let h1 = 0x9e3779b1;
	let h2 = 0x85ebca77;
	let h3 = 0xc2b2ae3d;
	let total = 0;

	for (let s = 0; s < 2; s++) {
		const str = s === 0 ? sql : paramIds;
		const len = str.length;
		total += len;

		let i = 0;
		for (; i + 1 < len; i += 2) {
			const k = (str.charCodeAt(i) | (str.charCodeAt(i + 1) << 16)) >>> 0;
			h1 = (Math.imul(rotl(h1 ^ k, 13), 5) + 0xe6546b64) | 0;
			h2 = (Math.imul(rotl(h2 ^ k, 17), 3) + 0x9e3779b9) | 0;
			h3 = (Math.imul(rotl(h3 ^ k, 19), 7) + 0x85ebca6b) | 0;
		}
		if (i < len) {
			const k = str.charCodeAt(i);
			h1 = (Math.imul(rotl(h1 ^ k, 13), 5) + 0xe6546b64) | 0;
			h2 = (Math.imul(rotl(h2 ^ k, 17), 3) + 0x9e3779b9) | 0;
			h3 = (Math.imul(rotl(h3 ^ k, 19), 7) + 0x85ebca6b) | 0;
		}

		h1 = (h1 ^ 0x2545f491) | 0;
		h3 = (h3 ^ 0x14057b7d) | 0;
	}

	h1 ^= total;
	h2 ^= total;
	h3 ^= total;
	h1 = (h1 + h2 + h3) | 0;
	h2 = (h2 + h1) | 0;
	h3 = (h3 + h1) | 0;
	h1 = fmix32(h1);
	h2 = fmix32(h2);
	h3 = fmix32(h3);
	h2 = (h2 + h1) >>> 0;
	h3 = (h3 + h2) >>> 0;

	return encodeLeadLane(h1) + encodeLane(h2) + encodeLane(h3);
}
