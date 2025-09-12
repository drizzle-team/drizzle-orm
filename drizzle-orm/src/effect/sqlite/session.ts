/* eslint-disable unicorn/no-array-method-this-argument */
/* eslint-disable unicorn/no-array-callback-reference */
import { SqliteClient } from '@effect/sql-sqlite-node/SqliteClient';
import type { SqlError } from '@effect/sql/SqlError';
import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { BatchItem as BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type { PreparedQueryConfig, SQLiteExecuteMethod, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

interface EffectSQLiteSessionOptions {
	logger?: Logger;
}

export class EffectSQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'sync', any, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectSQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: EffectSQLiteSessionOptions,
		// private tx: Transaction | undefined,
	) {
		super(dialect);
		this.logger = this.options.logger ?? new NoopLogger();
		this.cache = new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig>(
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
	): EffectSQLitePreparedQuery<T> {
		return new EffectSQLitePreparedQuery(
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

	prepareRelationalQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): EffectSQLitePreparedQuery<T, true> {
		return new EffectSQLitePreparedQuery(
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

	effectRun(query: SQL): Effect.Effect<Record<string, unknown>[], SqlError, SqliteClient> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).run() as any;
	}

	effectAll<T = unknown>(query: SQL): Effect.Effect<T[], SqlError, SqliteClient> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).all() as any;
	}

	effectGet<T = unknown>(query: SQL): Effect.Effect<T, SqlError, SqliteClient> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).get() as any;
	}

	effectValues<T = unknown>(query: SQL): Effect.Effect<T[], SqlError, SqliteClient> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).values() as any;
	}

	/** @deprecated Use `.effectRun()` for `Effect` compatibility */
	override run: any = () => {
		throw new Error('Use `.effectRun()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectAll()` for `Effect` compatibility */
	override all: any = () => {
		throw new Error('Use `.effectAll()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectGet()` for `Effect` compatibility */
	override get: any = () => {
		throw new Error('Use `.effectGet()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectValues()` for `Effect` compatibility */
	override values: any = () => {
		throw new Error('Use `.effectValues()` for `Effect` compatibility');
	};

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(_queries: T) {
		throw new Error('Not implemented!');
	}

	async migrate<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(_queries: T) {
		throw new Error('Not implemented!');
	}

	override transaction<T>(
		_transaction: any,
		_config?: SQLiteTransactionConfig,
	): T {
		throw new Error('Not implemented!');
	}

	override extractRawAllValueFromBatchResult(result: unknown): unknown {
		return (result as any).rows;
	}

	override extractRawGetValueFromBatchResult(result: unknown): unknown {
		return (result as any).rows[0];
	}

	override extractRawValuesValueFromBatchResult(result: unknown): unknown {
		return (result as any).rows;
	}
}

export class EffectSQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{
		type: 'sync';
		run: Effect.Effect<T['run'], SqlError, SqliteClient>;
		all: Effect.Effect<T['all'], SqlError, SqliteClient>;
		get: Effect.Effect<T['get'], SqlError, SqliteClient>;
		values: Effect.Effect<T['values'], SqlError, SqliteClient>;
		execute: Effect.Effect<T['execute'], SqlError, SqliteClient>;
	}
> {
	static override readonly [entityKind]: string = 'EffectSQLitePreparedQuery';

	constructor(
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
		super('sync', executeMethod, query, cache, queryMetadata, cacheConfig);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
	}

	run(placeholderValues?: Record<string, unknown>): Effect.Effect<T['run'], SqlError, SqliteClient> {
		const { query, logger } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		return Effect.flatMap(SqliteClient, (client) => {
			logger.logQuery(query.sql, params);
			return client.unsafe(query.sql, params as any);
		}) as any;
	}

	all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], SqlError, SqliteClient> {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

		const { query, logger, customResultMapper, fields, joinsNotNullableMap } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		if (!fields && !customResultMapper) {
			return Effect.flatMap(SqliteClient, (client) => {
				logger.logQuery(query.sql, params);
				return client.unsafe(query.sql, params as any).withoutTransform;
			});
		}

		return Effect.flatMap(SqliteClient, (client) => {
			logger.logQuery(query.sql, params);
			return client.unsafe(query.sql, params as any).values;
		}).pipe(Effect.andThen(
			(rows) => {
				return rows.map((row) =>
					mapResultRow(
						fields!,
						row as unknown[],
						joinsNotNullableMap,
					)
				);
			},
		));
	}

	private allRqbV2(
		placeholderValues?: Record<string, unknown>,
	): Effect.Effect<T['all'], SqlError, SqliteClient> {
		const { query, logger, customResultMapper } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		return Effect.flatMap(SqliteClient, (client) => {
			logger.logQuery(query.sql, params);
			return client.unsafe(query.sql, params as any).withoutTransform;
		}).pipe(Effect.andThen((v) =>
			(customResultMapper as (
				rows: Record<string, unknown>[],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(v as Record<string, unknown>[])
		));
	}

	get(placeholderValues?: Record<string, unknown>): Effect.Effect<T['get'], SqlError, SqliteClient> {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

		const { query, logger, customResultMapper, fields, joinsNotNullableMap } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		if (!fields && !customResultMapper) {
			return Effect.flatMap(SqliteClient, (client) => {
				logger.logQuery(query.sql, params);
				return client.unsafe(query.sql, params as any).withoutTransform;
			}).pipe(Effect.andThen((v) => v[0]));
		}

		return Effect.flatMap(SqliteClient, (client) => {
			logger.logQuery(query.sql, params);
			return client.unsafe(query.sql, params as any).values;
		}).pipe(Effect.andThen(
			(v) => {
				const row = (<unknown[][]> v)[0];

				if (row === undefined) return row;

				return mapResultRow<[Record<string, unknown>]>(
					fields!,
					row,
					joinsNotNullableMap,
				);
			},
		));
	}

	private getRqbV2(placeholderValues?: Record<string, unknown>): Effect.Effect<T['get'], SqlError, SqliteClient> {
		const { query, logger, customResultMapper } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		return Effect.flatMap(SqliteClient, (client) => {
			logger.logQuery(query.sql, params);
			return client.unsafe(query.sql, params as any).withoutTransform;
		}).pipe(Effect.andThen(
			(v) => {
				const row = (<Record<string, unknown>[]> v)[0];

				if (row === undefined) return row;

				return (customResultMapper as (
					rows: Record<string, unknown>[],
					mapColumnValue?: (value: unknown) => unknown,
				) => unknown)([row]);
			},
		));
	}

	values(placeholderValues?: Record<string, unknown>): Effect.Effect<T['values'], SqlError, SqliteClient> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});

		return Effect.flatMap(SqliteClient, (client) => {
			this.logger.logQuery(this.query.sql, params);
			return client.unsafe(this.query.sql, params as any).values;
		});
	}

	effect(placeholderValues?: Record<string, unknown>): Effect.Effect<T['execute'], SqlError, SqliteClient> {
		return this[this.executeMethod](placeholderValues);
	}

	/** @deprecated Use `.effect()` for `Effect` compatibility */
	override execute(
		_placeholderValues?: Record<string, unknown>,
	): never {
		throw new Error('Use `.effect()` for `Effect` compatibility');
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
