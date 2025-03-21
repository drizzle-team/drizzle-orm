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

	override async get(key: string, tables: string[], isTag: boolean = false): Promise<any[] | undefined> {
		const compositeKey = tables.sort().join(','); // Generate the composite key for the query

		if (isTag) {
			// Handle cache lookup for tags
			const tagCompositeKey = await this.redis.hget<string>('tagsMap', key); // Retrieve composite key associated with the tag
			if (tagCompositeKey) {
				return await this.redis.hget(tagCompositeKey, key) as any[]; // Retrieve the cached result for the tag
			}
			return undefined;
		}

		// Normal cache lookup for the composite key
		return await this.redis.hget(compositeKey, key) ?? undefined; // Retrieve result for normal query
	}

	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean = false,
		_config?: CacheConfig,
	): Promise<void> {
		if (isTag) {
			// When it's a tag, store the response in the composite key
			const compositeKey = tables.sort().join(',');
			await this.redis.hset(compositeKey, { [key]: response }); // Store the result with the tag under the composite key
			await this.redis.hset('tagsMap', { [key]: compositeKey }); // Store the tag and its composite key in the map
			for (const table of tables) {
				await this.redis.sadd(`prefix_${table}`, compositeKey);
			}
		} else {
			// Normal cache store
			const compositeKey = tables.sort().join(',');
			await this.redis.hset(compositeKey, { [key]: response }); // Store the result with the composite key
		}
	}

	override async onMutate(params: MutationOption) {
		const tags = Array.isArray(params.tags) ? params.tags : params.tags ? [params.tags] : [];
		const tables = Array.isArray(params.tables) ? params.tables : params.tables ? [params.tables] : [];
		const mappedTables = tables.map((table) => is(table, Table) ? table[OriginalName] : table as string);
		const prefixedMappedTables = tables.map((table) => `prefix_${table}`);

		const keysToDelete = new Set<string>();

		// Invalidate by table
		if (tables.length > 0) {
			// @ts-expect-error
			const compositeKeys: string[] = await this.redis.sunion(...prefixedMappedTables);
			for (const composite of compositeKeys) {
				const keys = await this.redis.hkeys(composite);
				for (const key of keys) keysToDelete.add(key);
				await this.redis.del(composite); // Remove composite entry
			}
			await this.redis.del(...prefixedMappedTables, ...mappedTables); // Remove table mappings
		}

		// Invalidate by tag (WITHOUT invalidating the entire table)
		for (const tag of tags) {
			const compositeKey = await this.redis.hget<string>('tagsMap', tag);
			if (compositeKey) {
				await this.redis.hdel(compositeKey, tag); // Only remove the tag-related entry
				await this.redis.hdel('tagsMap', tag); // Remove tag reference
			}
		}

		// Delete affected cache entries
		if (keysToDelete.size > 0) {
			await this.redis.del(...keysToDelete);
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
