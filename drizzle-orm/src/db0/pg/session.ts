import type { Database, Primitive } from 'db0';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';
import { mapDb0RowToArray } from '../_row-mapping.ts';

export interface Db0PgSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export interface Db0PgQueryResult {
	rows: unknown[];
	rowCount: number;
}

export class Db0PgPreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'Db0PgPreparedQuery';

	constructor(
		private client: Database,
		private dialect: PgDialect,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		cache: Cache,
		queryMetadata: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] } | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues) as Primitive[];
		this.logger.logQuery(this.queryString, params);

		const { fields, client, customResultMapper, queryString, joinsNotNullableMap } = this;

		if (!fields && !customResultMapper) {
			return await this.queryWithCache(queryString, params, async () => {
				const stmt = client.prepare(queryString);
				const rows = await stmt.all(...params) as unknown[];
				return { rows, rowCount: rows.length } as T['execute'];
			});
		}

		// db0 doesn't have array mode, so we get objects and map them into arrays in selection order.
		return await this.queryWithCache(queryString, params, async () => {
			// Prefer querying in array mode when the underlying driver supports it (e.g. pglite),
			// otherwise joined tables with duplicate column names can be collapsed in object mode.
			if (fields || customResultMapper) {
				try {
					const instance = await (client as any).getInstance?.();
					if (instance && typeof instance.query === 'function') {
						const result = await instance.query(queryString, params, { rowMode: 'array' });
						if (result?.rows && (result.rows.length === 0 || Array.isArray(result.rows[0]))) {
							const arrayRows = result.rows as unknown[][];
							if (customResultMapper) {
								return customResultMapper(arrayRows);
							}
							return arrayRows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
						}
					}
				} catch {
					// Fall back to object mode mapping below.
				}
			}

			const stmt = client.prepare(queryString);
			const rows = await stmt.all(...params) as Record<string, unknown>[];
			const arrayRows = rows.map((row) => (fields ? mapDb0RowToArray(row, fields, this.dialect) : Object.values(row)));

			if (customResultMapper) {
				return customResultMapper(arrayRows);
			}

			return arrayRows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
		});
	}

	async all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues) as Primitive[];
		this.logger.logQuery(this.queryString, params);
		return await this.queryWithCache(this.queryString, params, async () => {
			const stmt = this.client.prepare(this.queryString);
			return stmt.all(...params) as Promise<T['all']>;
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export class Db0PgSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<Db0PgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'Db0PgSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: Db0PgSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
		queryMetadata?: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] },
		cacheConfig?: WithCacheConfig,
	): PgPreparedQuery<T> {
		return new Db0PgPreparedQuery(
			this.client,
			this.dialect,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			name,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (tx: Db0PgTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		const tx = new Db0PgTransaction<TFullSchema, TSchema>(this.dialect, this, this.schema);

		let beginSql = 'begin';
		if (config) {
			const chunks: string[] = [];
			if (config.isolationLevel) {
				chunks.push(`isolation level ${config.isolationLevel}`);
			}
			if (config.accessMode) {
				chunks.push(config.accessMode);
			}
			if (typeof config.deferrable === 'boolean') {
				chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
			}
			if (chunks.length > 0) {
				beginSql = `begin ${chunks.join(' ')}`;
			}
		}

		await this.execute(sql.raw(beginSql));
		try {
			const result = await transaction(tx);
			await this.execute(sql`commit`);
			return result;
		} catch (err) {
			await this.execute(sql`rollback`);
			throw err;
		}
	}

	override async count(countSql: SQL): Promise<number> {
		const res = await this.execute<Db0PgQueryResult>(countSql);
		return Number((res.rows[0] as Record<string, unknown>)['count']);
	}
}

export class Db0PgTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<Db0PgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'Db0PgTransaction';

	override async transaction<T>(
		transaction: (tx: Db0PgTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new Db0PgTransaction<TFullSchema, TSchema>(this.dialect, this.session, this.schema, this.nestedIndex + 1);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export interface Db0PgQueryResultHKT extends PgQueryResultHKT {
	type: Db0PgQueryResult;
}
