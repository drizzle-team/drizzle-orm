/// <reference types="@cloudflare/workers-types" />
import type { MutationOption } from '~/cache/core/index.ts';
import { Cache, hashQuery } from '~/cache/core/index.ts';
import { entityKind, is } from '~/entity.ts';
import { OriginalName, Table } from '~/table.ts';
import type { CacheConfig } from '../core/types.ts';

const minimumExpirationTtl = 60;
const defaultExpirationTtl = 300;

type Strategy = 'explicit' | 'all';
type ExpirationOptions = Pick<KVNamespacePutOptions, 'expiration' | 'expirationTtl'>;
type IndexMetadata = { cacheKey: string };

export interface CloudflareKVCacheOptions {
	/**
	 * Cache only queries using `.$withCache()` or cache all queries.
	 *
	 * @default 'explicit'
	 */
	strategy?: Strategy;
	/**
	 * Prefix used for every key created by this cache.
	 *
	 * @default 'drizzle'
	 */
	prefix?: string;
	/**
	 * Default expiration used when a query does not provide its own cache config.
	 *
	 * @default { ex: 300 }
	 */
	config?: CacheConfig;
}

export class CloudflareKVCache extends Cache {
	static override readonly [entityKind]: string = 'CloudflareKVCache';

	private readonly strategyMode: Strategy;
	private readonly prefix: string;
	private readonly expiration: ExpirationOptions;

	constructor(
		private readonly kv: KVNamespace,
		options: CloudflareKVCacheOptions = {},
	) {
		super();
		this.strategyMode = options.strategy ?? 'explicit';
		this.prefix = options.prefix ?? 'drizzle';
		this.expiration = toExpirationOptions(options.config ?? {}, { expirationTtl: defaultExpirationTtl });

		if (this.prefix.length === 0) {
			throw new Error('Cloudflare KV cache prefix must not be empty.');
		}
	}

	override strategy(): Strategy {
		return this.strategyMode;
	}

	override async get(
		key: string,
		_tables: string[],
		isTag: boolean,
		_isAutoInvalidate?: boolean,
	): Promise<any[] | undefined> {
		const value = await this.kv.get<any[]>(this.cacheKey(key, isTag), 'json');
		return value ?? undefined;
	}

	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Promise<void> {
		const cacheKey = this.cacheKey(key, isTag);
		const expiration = config === undefined ? this.expiration : toExpirationOptions(config, this.expiration);

		await this.kv.put(cacheKey, JSON.stringify(response), expiration);

		const indexId = await hashQuery(cacheKey);
		const uniqueTables = new Set(tables);
		const indexWrites = [...uniqueTables].map((table) => this.putTableIndex(table, indexId, cacheKey, expiration));

		await Promise.all(indexWrites);
	}

	override async onMutate(params: MutationOption): Promise<void> {
		const tags = new Set(Array.isArray(params.tags) ? params.tags : params.tags ? [params.tags] : []);
		const tables = new Set(Array.isArray(params.tables) ? params.tables : params.tables ? [params.tables] : []);
		const invalidations: Promise<void>[] = [];

		for (const tag of tags) {
			invalidations.push(this.kv.delete(this.cacheKey(tag, true)));
		}

		for (const table of tables) {
			const tableName = is(table, Table) ? table[OriginalName] : table as string;
			invalidations.push(this.invalidateTable(tableName));
		}

		await Promise.all(invalidations);
	}

	private cacheKey(key: string, isTag: boolean): string {
		return `${this.prefix}:${isTag ? 'tag' : 'query'}:${key}`;
	}

	private tableIndexPrefix(table: string): string {
		return `${this.prefix}:table:${encodeURIComponent(table)}:`;
	}

	private async putTableIndex(
		table: string,
		indexId: string,
		cacheKey: string,
		expiration: ExpirationOptions,
	): Promise<void> {
		const indexKey = `${this.tableIndexPrefix(table)}${indexId}`;

		await this.kv.put(indexKey, '', {
			...expiration,
			metadata: { cacheKey } satisfies IndexMetadata,
		});
	}

	private async invalidateTable(table: string): Promise<void> {
		const prefix = this.tableIndexPrefix(table);
		let cursor: string | undefined;

		do {
			const result = await this.kv.list<IndexMetadata>({ prefix, cursor });
			const deletions: Promise<void>[] = [];

			for (const entry of result.keys) {
				deletions.push(this.kv.delete(entry.name));

				if (entry.metadata?.cacheKey) {
					deletions.push(this.kv.delete(entry.metadata.cacheKey));
				}
			}

			await Promise.all(deletions);
			cursor = result.list_complete ? undefined : result.cursor;
		} while (cursor !== undefined);
	}
}

function toExpirationOptions(config: CacheConfig, fallback: ExpirationOptions): ExpirationOptions {
	if (config.keepTtl) {
		throw new Error('Cloudflare KV does not support the keepTtl cache option.');
	}
	if (config.hexOptions !== undefined) {
		throw new Error('Cloudflare KV does not support the hexOptions cache option.');
	}

	if (config.ex !== undefined) {
		return { expirationTtl: validateExpirationTtl(config.ex) };
	}
	if (config.px !== undefined) {
		return { expirationTtl: validateExpirationTtl(millisecondsToSeconds(config.px)) };
	}
	if (config.exat !== undefined) {
		return { expiration: validateExpiration(config.exat) };
	}
	if (config.pxat !== undefined) {
		return { expiration: validateExpiration(millisecondsToSeconds(config.pxat)) };
	}

	return fallback;
}

function millisecondsToSeconds(value: number): number {
	if (!Number.isInteger(value)) {
		throw new Error('Cloudflare KV expiration values in milliseconds must be integers.');
	}
	return Math.ceil(value / 1000);
}

function validateExpirationTtl(value: number): number {
	if (!Number.isInteger(value) || value < minimumExpirationTtl) {
		throw new Error(
			`Cloudflare KV expiration TTL must be an integer of at least ${minimumExpirationTtl} seconds.`,
		);
	}
	return value;
}

function validateExpiration(value: number): number {
	if (!Number.isInteger(value) || value < Math.floor(Date.now() / 1000) + minimumExpirationTtl) {
		throw new Error(
			`Cloudflare KV expiration must be an integer at least ${minimumExpirationTtl} seconds in the future.`,
		);
	}
	return value;
}

export function cloudflareKVCache(
	kv: KVNamespace,
	options?: CloudflareKVCacheOptions,
): CloudflareKVCache {
	return new CloudflareKVCache(kv, options);
}
