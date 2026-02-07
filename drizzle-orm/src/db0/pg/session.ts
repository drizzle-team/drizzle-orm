import type { Database, Primitive } from 'db0';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
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

export class Db0PgPreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends PgAsyncPreparedQuery<T> {
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
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

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
								return (customResultMapper as (rows: unknown[][]) => T['execute'])(arrayRows);
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

			// db0 doesn't expose values/array mode in its public API, so fall back to mapping object rows.
			// For selections where db0 collapses duplicate column names, fail instead of returning wrong data.
			if (fields) {
				if (arrayRows.some((r) => r.length !== fields.length)) {
					throw new Error(
						'db0 pg connector returned object rows with duplicate column names; use db0/connectors/pglite for correct join/alias results.',
					);
				}
			}

			if (customResultMapper) {
				return (customResultMapper as (rows: unknown[][]) => T['execute'])(arrayRows);
			}

			return arrayRows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
		});
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues) as Primitive[];
		this.logger.logQuery(this.queryString, params);

		const { client, customResultMapper, queryString } = this;

		const rows = await this.queryWithCache(queryString, params, async () => {
			const stmt = client.prepare(queryString);
			return await stmt.all(...params) as Record<string, unknown>[];
		});

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(rows);
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues) as Primitive[];
		this.logger.logQuery(this.queryString, params);
		return this.queryWithCache(this.queryString, params, async () => {
			const stmt = this.client.prepare(this.queryString);
			return await stmt.all(...params) as T['all'];
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export class Db0PgSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<Db0PgQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'Db0PgSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
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
	): Db0PgPreparedQuery<T> {
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

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (rows: Record<string, unknown>[], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): Db0PgPreparedQuery<T, true> {
		return new Db0PgPreparedQuery(
			this.client,
			this.dialect,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			name,
			false,
			customResultMapper,
			true,
		);
	}

	override async transaction<T>(
		transaction: (tx: Db0PgTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		const tx = new Db0PgTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this,
			this.relations,
			this.schema,
		);
		await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		}
	}
}

export class Db0PgTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<Db0PgQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'Db0PgTransaction';

	override async transaction<T>(
		transaction: (tx: Db0PgTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new Db0PgTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
		);
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
