import { entityKind } from '~/entity.ts';
import type { Table } from '~/index.ts';
import type { CacheConfig } from './types.ts';

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
	override strategy() {
		return 'all' as const;
	}

	static override readonly [entityKind]: string = 'NoopCache';

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

export type MutationOption = { tags?: string | string[]; tables?: Table<any> | Table<any>[] | string | string[] };

/**
 * JSON.stringify throws on BigInt values (e.g. int8/bigserial columns decoded
 * as BigInt by some drivers like @effect/sql-pg). Replace them with their
 * string representation so hashing and caching never fail on such rows.
 */
export function stringifyForCache(value: unknown): string {
	return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/** Recursively converts BigInt values to strings so they survive JSON
 * serialization performed downstream (e.g. by @upstash/redis). */
export function bigintsToStrings(value: any): any {
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) return value.map(bigintsToStrings);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, bigintsToStrings(v)]),
		);
	}
	return value;
}

export async function hashQuery(sql: string, params?: any[]) {
	const dataToHash = `${sql}-${stringifyForCache(params)}`;
	const encoder = new TextEncoder();
	const data = encoder.encode(dataToHash);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = [...new Uint8Array(hashBuffer)];
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex;
}
