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

export async function hashQuery(sql: string, params?: any[]) {
	const dataToHash = `${sql}-${JSON.stringify(params)}`;
	const encoder = new TextEncoder();
	const data = encoder.encode(dataToHash);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = [...new Uint8Array(hashBuffer)];
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex;
}

const cacheEntryVersion = 1;

export type CachedQueryEntry = { v: number; q: string; r: any };

export function toCacheEntry(query: string, response: any): CachedQueryEntry {
	return { v: cacheEntryVersion, q: query, r: response };
}

/**
 * Unwrap a cached response, or return `undefined` if it cannot be used by this query.
 *
 * Cached payloads are raw driver responses, and most drivers return rows positionally -
 * the column names are applied afterwards, from the field list of whatever query reads
 * the entry. A differing `q` therefore means a different column layout, so mapping the
 * entry would shift values between properties instead of merely serving stale data.
 * This matters for queries cached under a custom tag, whose key stays the same when the
 * query changes. A differing `v` means the entry predates this envelope. Both are
 * treated as a cache miss and refetched.
 */
export function fromCacheEntry(entry: any, query: string): any | undefined {
	return entry?.v === cacheEntryVersion && entry.q === query ? entry.r : undefined;
}
