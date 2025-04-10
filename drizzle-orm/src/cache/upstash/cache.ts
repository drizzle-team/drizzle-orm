import { Redis } from '@upstash/redis';
import type { MutationOption } from '~/cache/core/index.ts';
import { Cache } from '~/cache/core/index.ts';
import { entityKind, is } from '~/entity.ts';
import { OriginalName, Table } from '~/index.ts';
import type { CacheConfig } from '../core/types.ts';

const getByTagScript = `
local tagsMapKey = KEYS[1] -- tags map key
local tag        = ARGV[1] -- tag

local compositeTableName = redis.call('HGET', key, tag)
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

type Script = ReturnType<Redis['createScript']>;

type ExpireOptions = 'NX' | 'nx' | 'XX' | 'xx' | 'GT' | 'gt' | 'LT' | 'lt';

export class UpstashCache extends Cache {
	static override readonly [entityKind]: string = 'UpstashCache';
	private static compositeTableSetPrefix = '__ct__';
	private static tagsMapKey = '__tagsMap__';

	private globalTtl: number = 1;

	private luaScripts: {
		getByTagScript: Script;
		onMutateScript: Script;
	};

	private internalConfig?: { seconds: number; hexOptions: ExpireOptions };

	constructor(public redis: Redis, config?: CacheConfig, protected useGlobally?: boolean) {
		super();
		this.internalConfig = this.toInternalConfig(config);
		this.luaScripts = {
			getByTagScript: this.redis.createScript(getByTagScript, { readonly: true }),
			onMutateScript: this.redis.createScript(onMutateScript),
		};
	}

	public strategy() {
		return this.useGlobally ? 'all' : 'explicit';
	}

	private toInternalConfig(config?: CacheConfig) {
		return config
			? {
				seconds: config.ex,
				hexOptions: config.hexOptions,
			} as { seconds: number; hexOptions: ExpireOptions }
			: undefined;
	}

	override async get(key: string, tables: string[], isTag: boolean = false): Promise<any[] | undefined> {
		if (isTag) {
			const result = await this.luaScripts.getByTagScript.exec([UpstashCache.tagsMapKey], [key]);
			return result === null ? undefined : result as any[];
		}

		// Normal cache lookup for the composite key
		const compositeKey = this.getCompositeKey(tables);
		const result = await this.redis.hget(compositeKey, key) ?? undefined; // Retrieve result for normal query
		return result === null ? undefined : result as any[];
	}

	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean = false,
		config?: CacheConfig,
	): Promise<void> {
		const pipeline = this.redis.pipeline();
		const compositeKey = this.getCompositeKey(tables);
		const ttlSeconds = config && config.ex ? config.ex : this.globalTtl;
		const hexOptions = config && config.hexOptions ? config.hexOptions : this.internalConfig?.hexOptions;
		
		pipeline.hset(compositeKey, { [key]: response }); // Store the result with the tag under the composite key
		pipeline.hexpire(compositeKey, key, ttlSeconds, hexOptions); // Set expiration for the composite key

		if (isTag) {
			pipeline.hset(UpstashCache.tagsMapKey, { [key]: compositeKey }); // Store the tag and its composite key in the map
			pipeline.hexpire(UpstashCache.tagsMapKey, key, ttlSeconds, hexOptions); // Set expiration for the tag
		}

		for (const table of tables) {
			pipeline.sadd(this.addTablePrefix(table), compositeKey);
		}

		await pipeline.exec();
	}

	override async onMutate(params: MutationOption) {
		const tags = Array.isArray(params.tags) ? params.tags : params.tags ? [params.tags] : [];
		const tables = Array.isArray(params.tables) ? params.tables : params.tables ? [params.tables] : [];
		const tableNames: string[] = tables.map((table) => is(table, Table) ? table[OriginalName] : table as string);

		const compositeTableSets = tableNames.map((table) => this.addTablePrefix(table));
		await this.luaScripts.onMutateScript.exec([UpstashCache.tagsMapKey, ...compositeTableSets], tags);
	}

	private addTablePrefix = (table: string) => `${UpstashCache.compositeTableSetPrefix}${table}`;
	private getCompositeKey = (tables: string[]) => tables.sort().join(',');
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
