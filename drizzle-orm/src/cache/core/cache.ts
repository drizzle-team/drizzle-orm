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
