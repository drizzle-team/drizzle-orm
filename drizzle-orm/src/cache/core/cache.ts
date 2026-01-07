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

export async function hashQuery(sql: string, params?: any[]) {
	const dataToHash = `${sql}-${JSON.stringify(params, (_, v) => typeof v === 'bigint' ? `${v}n` : v)}`;
	const encoder = new TextEncoder();
	const data = encoder.encode(dataToHash);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = [...new Uint8Array(hashBuffer)];
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex;
}
