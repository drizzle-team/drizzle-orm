import type { DatabasePromise } from '@tursodatabase/database-common';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	Result,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';
import type { TursoDatabaseRunResult } from './driver-core.ts';

export interface TursoDatabaseSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class TursoDatabaseSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', TursoDatabaseRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'TursoDatabaseSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: DatabasePromise,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: TursoDatabaseSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): TursoDatabasePreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);

		return new TursoDatabasePreparedQuery(
			stmt,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): TursoDatabasePreparedQuery<T, true> {
		const stmt = this.client.prepare(query.sql);

		return new TursoDatabasePreparedQuery(
			stmt,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			executeMethod,
			false,
			customResultMapper,
			true,
		);
	}

	override async transaction<T>(
		transaction: (db: TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		_config?: SQLiteTransactionConfig,
		tx?: TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>,
	): Promise<T> {
		const session = new TursoDatabaseSession<TFullSchema, TRelations, TSchema>(
			this.client,
			this.dialect,
			this.relations,
			this.schema,
			this.options,
		);
		const localTx = tx ?? new TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>(
			'async',
			this.dialect,
			session,
			this.relations,
			this.schema,
		);

		const clientTx = this.client.transaction(async () => await transaction(localTx));

		const result = await clientTx();
		return result;
	}

	override async run(query: SQL): Result<'async', TursoDatabaseRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return await this.prepareOneTimeQuery(staticQuery, undefined, 'run', false).run() as Result<
				'async',
				TursoDatabaseRunResult
			>;
		} catch (err) {
			throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
		}
	}

	override async all<T = unknown>(query: SQL): Result<'async', T[]> {
		return await this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).all() as Result<
			'async',
			T[]
		>;
	}

	override async get<T = unknown>(query: SQL): Result<'async', T> {
		return await this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).get() as Result<
			'async',
			T
		>;
	}

	override async values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<'async', T[]> {
		return await this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).values() as Result<
			'async',
			T[]
		>;
	}
}

export class TursoDatabaseTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', TursoDatabaseRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'TursoDatabaseTransaction';

	override async transaction<T>(
		_transaction: (tx: TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		// Not supported by driver
		throw new Error('Nested transactions are not supported');

		// const savepointName = `sp${this.nestedIndex}`;

		// const tx = new TursoDatabaseTransaction(
		// 	'async',
		// 	this.dialect,
		// 	this.session,
		// 	this.relations,
		// 	this.schema,
		// 	this.nestedIndex + 1,
		// );

		// await this.session.run(sql.raw(`savepoint ${savepointName}`));
		// try {
		// 	const result = await (<TursoDatabaseSession<TFullSchema, TRelations, TSchema>> (this.session)).transaction(
		// 		transaction,
		// 		undefined,
		// 		tx,
		// 	);
		// 	await this.session.run(sql.raw(`release savepoint ${savepointName}`));
		// 	return result;
		// } catch (err) {
		// 	await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
		// 	throw err;
		// }
	}
}

export class TursoDatabasePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{
		type: 'async';
		run: TursoDatabaseRunResult;
		all: T['all'];
		get: T['get'];
		values: T['values'];
		execute: T['execute'];
	}
> {
	static override readonly [entityKind]: string = 'TursoDatabasePreparedQuery';

	constructor(
		private stmt: ReturnType<DatabasePromise['prepare']>,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		/** @internal */ public fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<TursoDatabaseRunResult> {
		const { stmt, query, logger } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		return await this.queryWithCache(query.sql, params, async () => {
			return await (params.length ? stmt.run(...params) : stmt.run());
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		if (this.isRqbV2Query) return await this.allRqbV2(placeholderValues);

		const { fields, logger, query, customResultMapper, joinsNotNullableMap, stmt } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				return await (params.length ? stmt.raw(false).all(...params) : stmt.raw(false).all());
			});
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private async allRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { logger, query, customResultMapper, stmt } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const rows = await (params.length ? stmt.raw(false).all(...params) : stmt.raw(false).all());

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)(rows as Record<string, unknown>[]) as T['all'];
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (this.isRqbV2Query) return await this.getRqbV2(placeholderValues);

		const { fields, logger, query, stmt, customResultMapper, joinsNotNullableMap } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		if (!fields && !customResultMapper) {
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				return await (params.length ? stmt.raw(false).get(...params) : stmt.raw(false).get());
			});
		}

		const row = await this.queryWithCache(query.sql, params, async () => {
			return await (params.length ? stmt.raw(true).get(...params) : stmt.raw(true).get());
		});

		if (row === undefined) return row;

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private async getRqbV2(placeholderValues?: Record<string, unknown>) {
		const { logger, query, stmt, customResultMapper } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const row = await (params.length ? stmt.raw(false).get(...params) : stmt.raw(false).get());

		if (row === undefined) return row;

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)([row] as Record<string, unknown>[]) as T['get'];
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const { logger, stmt, query } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		return await this.queryWithCache(query.sql, params, async () => {
			return await (params.length ? stmt.raw(true).all(...params) : stmt.raw(true).all());
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
