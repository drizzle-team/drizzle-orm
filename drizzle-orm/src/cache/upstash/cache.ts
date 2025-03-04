import type { SetCommandOptions } from '@upstash/redis';
import { Redis } from '@upstash/redis';
import type { MutationOption } from '~/cache/core/index.ts';
import { Cache } from '~/cache/core/index.ts';
import { entityKind, is } from '~/entity.ts';
import { OriginalName, Table } from '~/index.ts';
import type { CacheConfig } from '../core/types.ts';

export class UpstashCache extends Cache {
	static override readonly [entityKind]: string = 'UpstashCache';

	private internalConfig?: SetCommandOptions;

	constructor(public redis: Redis, config?: CacheConfig, protected useGlobally?: boolean) {
		super();
		this.internalConfig = this.toInternalConfig(config);
	}

	public strategy() {
		return this.useGlobally ? 'all' : 'explicit';
	}

	private toInternalConfig(config?: CacheConfig) {
		return config
			? {
				ex: config.ex,
				exat: config.exat,
				px: config.px,
				pxat: config.pxat,
				keepTtl: config.keepTtl,
			} as SetCommandOptions
			: undefined;
	}

	override async get(key: string, _tables: string[], _isTag: boolean) {
		const res = await this.redis.get<any[]>(key) ?? undefined;
		return res;
	}

	override async put(key: string, response: any, tables: string[], isTag: boolean, config?: CacheConfig) {
		await this.redis.set(key, response, config ? this.toInternalConfig(config) : this.internalConfig);
		for (const table of tables) {
			await this.redis.sadd(table, key);
		}
	}

	override async onMutate(params: MutationOption) {
		const tagsArray = params.tags ? Array.isArray(params.tags) ? params.tags : [params.tags] : [];
		const tablesArray = params.tables ? Array.isArray(params.tables) ? params.tables : [params.tables] : [];

		const keysToDelete = new Set<string>();

		for (const table of tablesArray) {
			const tableName = is(table, Table) ? table[OriginalName] : table as string;
			const keys = await this.redis.smembers(tableName);
			for (const key of keys) keysToDelete.add(key); // Add to the set
		}

		if (keysToDelete.size > 0 || tagsArray.length > 0) {
			const pipeline = this.redis.pipeline();

			for (const tag of tagsArray) {
				pipeline.del(tag);
			}

			for (const key of keysToDelete) {
				pipeline.del(key);
				for (const table of tablesArray) {
					const tableName = is(table, Table) ? table[OriginalName] : table as string;
					pipeline.srem(tableName, key);
				}
			}

			await pipeline.exec();
		}
	}
}

export function upstashCache(
	{ url, token, config, global = false }: { url: string; token: string; config?: CacheConfig; global?: boolean },
): UpstashCache {
	const redis = new Redis({
		url,
		token,
	});

	return new UpstashCache(redis, config, global);
}
