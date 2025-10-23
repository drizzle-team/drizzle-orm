/// <reference types="bun-types" />

import { RedisClient } from 'bun';
import type { MutationOption } from '~/cache/core/index.ts';
import { Cache } from '~/cache/core/index.ts';
import { entityKind, is } from '~/entity.ts';
import { OriginalName, Table } from '~/index.ts';
import type { CacheConfig } from '../core/types.ts';

const getByTagScript = `
local tagsMapKey = KEYS[1] -- tags map key
local tag        = ARGV[1] -- tag

local compositeTableName = redis.call('HGET', tagsMapKey, tag)
if not compositeTableName then
  return nil
end

local value = redis.call('HGET', compositeTableName, tag)
return value
`;

const onMutateScript = `
local tagsMapKey = KEYS[1] -- tags map key
local tables     = {}      -- initialize tables array
local tags       = ARGV    -- tags array

for i = 2, #KEYS do
  tables[#tables + 1] = KEYS[i] -- add all keys except the first one to tables
end

if #tags > 0 then
  for _, tag in ipairs(tags) do
    if tag ~= nil and tag ~= '' then
      local compositeTableName = redis.call('HGET', tagsMapKey, tag)
      if compositeTableName then
        redis.call('HDEL', compositeTableName, tag)
      end
    end
  end
  redis.call('HDEL', tagsMapKey, unpack(tags))
end

local keysToDelete = {}

if #tables > 0 then
  local compositeTableNames = redis.call('SUNION', unpack(tables))
  for _, compositeTableName in ipairs(compositeTableNames) do
    keysToDelete[#keysToDelete + 1] = compositeTableName
  end
  for _, table in ipairs(tables) do
    keysToDelete[#keysToDelete + 1] = table
  end
  redis.call('DEL', unpack(keysToDelete))
end
`;

type ExpireOptions = 'NX' | 'nx' | 'XX' | 'xx' | 'GT' | 'gt' | 'LT' | 'lt';

export class BunRedisCache extends Cache {
	static override readonly [entityKind]: string = 'BunRedisCache';
	/**
	 * Prefix for sets which denote the composite table names for each unique table
	 *
	 * Example: In the composite table set of "table1", you may find
	 * `${compositeTablePrefix}table1,table2` and `${compositeTablePrefix}table1,table3`
	 */
	private static compositeTableSetPrefix = '__CTS__';
	/**
	 * Prefix for hashes which map hash or tags to cache values
	 */
	private static compositeTablePrefix = '__CT__';
	/**
	 * Key which holds the mapping of tags to composite table names
	 *
	 * Using this tagsMapKey, you can find the composite table name for a given tag
	 * and get the cache value for that tag:
	 *
	 * ```ts
	 * const compositeTable = redis.hget(tagsMapKey, 'tag1')
	 * console.log(compositeTable) // `${compositeTablePrefix}table1,table2`
	 *
	 * const cachevalue = redis.hget(compositeTable, 'tag1')
	 */
	private static tagsMapKey = '__tagsMap__';
	/**
	 * Queries whose auto invalidation is false aren't stored in their respective
	 * composite table hashes because those hashes are deleted when a mutation
	 * occurs on related tables.
	 *
	 * Instead, they are stored in a separate hash with the prefix
	 * `__nonAutoInvalidate__` to prevent them from being deleted when a mutation
	 */
	private static nonAutoInvalidateTablePrefix = '__nonAutoInvalidate__';

	private internalConfig: { seconds: number; hexOptions?: ExpireOptions };

	constructor(
		public redis: RedisClient,
		config?: CacheConfig,
		protected useGlobally?: boolean,
	) {
		super();
		this.internalConfig = this.toInternalConfig(config);
	}

	public strategy() {
		return this.useGlobally ? 'all' : 'explicit';
	}

	private toInternalConfig(config?: CacheConfig): { seconds: number; hexOptions?: ExpireOptions } {
		return config
			? {
				seconds: config.ex!,
				hexOptions: config.hexOptions,
			}
			: {
				seconds: 1,
			};
	}

	override async get(
		key: string,
		tables: string[],
		isTag: boolean = false,
		isAutoInvalidate?: boolean,
	): Promise<any[] | undefined> {
		if (!isAutoInvalidate) {
			const result = await this.redis.hmget(BunRedisCache.nonAutoInvalidateTablePrefix, [key]);
			return result === null ? undefined : (result as any[]);
		}

		if (isTag) {
			const result = await this.redis.send('EVAL', [
				getByTagScript,
				'1',
				BunRedisCache.tagsMapKey,
				key,
			]);
			return result === null ? undefined : (result as any[]);
		}

		const compositeKey = this.getCompositeKey(tables);
		const result = await this.redis.hmget(compositeKey, [key]);
		return result === null ? undefined : (result as any[]);
	}

	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean = false,
		config?: CacheConfig,
	): Promise<void> {
		const isAutoInvalidate = tables.length !== 0;
		const ttlSeconds = config && config.ex ? config.ex : this.internalConfig.seconds;

		if (!isAutoInvalidate) {
			if (isTag) {
				await this.redis.hmset(BunRedisCache.tagsMapKey, [
					key,
					BunRedisCache.nonAutoInvalidateTablePrefix,
				]);
				await this.redis.expire(BunRedisCache.tagsMapKey, ttlSeconds);
			}

			await this.redis.hmset(BunRedisCache.nonAutoInvalidateTablePrefix, [key, response]);
			await this.redis.expire(BunRedisCache.nonAutoInvalidateTablePrefix, ttlSeconds);
			return;
		}

		const compositeKey = this.getCompositeKey(tables);

		await this.redis.hmset(compositeKey, [key, response]);
		await this.redis.expire(compositeKey, ttlSeconds);

		if (isTag) {
			await this.redis.hmset(BunRedisCache.tagsMapKey, [key, compositeKey]);
			await this.redis.expire(BunRedisCache.tagsMapKey, ttlSeconds);
		}

		for (const table of tables) {
			const tableSetKey = this.addTablePrefix(table);
			await this.redis.sadd(tableSetKey, compositeKey);
		}
	}

	override async onMutate(params: MutationOption) {
		const tags = Array.isArray(params.tags) ? params.tags : params.tags ? [params.tags] : [];
		const tables = Array.isArray(params.tables)
			? params.tables
			: params.tables
			? [params.tables]
			: [];
		const tableNames: string[] = tables.map((table) => is(table, Table) ? table[OriginalName] : (table as string));

		const compositeTableSets = tableNames.map((table) => this.addTablePrefix(table));
		const keys = [BunRedisCache.tagsMapKey, ...compositeTableSets];
		const numKeys = keys.length;

		await this.redis.send('EVAL', [onMutateScript, numKeys.toString(), ...keys, ...tags]);
	}

	private addTablePrefix = (table: string) => `${BunRedisCache.compositeTableSetPrefix}${table}`;

	private getCompositeKey = (tables: string[]) => `${BunRedisCache.compositeTablePrefix}${tables.sort().join(',')}`;
}

export function bunRedisCache({
	url,
	redisClient,
	config,
	global = false,
}: {
	url?: string;
	redisClient?: RedisClient;
	config?: CacheConfig;
	global?: boolean;
}): BunRedisCache {
	const redis = redisClient ?? new RedisClient(url);

	return new BunRedisCache(redis, config, global);
}
