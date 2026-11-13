import type { QueryResult, ShapeSpec } from '#postgres';
import type { DrizzlePostgresClient as Client } from '#postgres/effect/core';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { BatchItem } from '~/batch.ts';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind, is } from '~/entity.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import {
	buildBulkInsert,
	buildBulkUpdate,
	type PostgresBulkInsertOptions,
	type PostgresBulkResult,
	type PostgresBulkUpdateOptions,
} from '~/postgres/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import { usedTablesOf } from '~/used-tables.ts';
import type { Simplify } from '~/utils.ts';

export interface EffectPostgresQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export interface EffectPostgresQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<PgRawRow<this['row']>>, 'metrics' | 'debug'>>;
}

export type EffectPostgresBulkInsertOptions = Omit<PostgresBulkInsertOptions, 'timeout' | 'signal'>;

export type EffectPostgresBulkUpdateOptions<TBy = PgColumn | readonly [PgColumn, ...PgColumn[]]> = Omit<
	PostgresBulkUpdateOptions<TBy>,
	'timeout' | 'signal'
>;

export class EffectPostgresPreparedQuery<T extends PreparedQueryConfig>
	extends PgEffectPreparedQuery<T, EffectPostgresQueryEffectHKT>
{
	static override readonly [entityKind]: string = 'EffectPostgresPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: EffectLoggerShape,
		cache: EffectCacheShape,
		queryMetadata: QueryMetadata | undefined,
		cacheConfig: WithCacheConfig | undefined,
		readonly shape: ShapeSpec | undefined,
		paramsInErrors: boolean | undefined,
	) {
		super(executor, query, mapper, mode, logger, cache, queryMetadata, cacheConfig, paramsInErrors);
	}
}

export type EffectPostgresPipelineResponse<T extends readonly BatchItem[]> = {
	[K in keyof T]: Result.Result<T[K]['_']['result'], EffectDrizzleQueryError>;
};

export interface EffectPostgresSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
	paramsInErrors?: boolean;
}

export class EffectPostgresSession<
	TRelations extends AnyRelations,
> extends PgEffectSession<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresSession';

	constructor(
		private client: Client.DrizzlePostgresClient,
		dialect: PgDialect,
		protected relations: TRelations,
		private options: EffectPostgresSessionOptions,
	) {
		super(dialect);
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
		shape?: ShapeSpec,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = (params?: unknown[]) => {
			const result = this.query(query.sql, params ?? [], mode, shape, queryName);

			if (mode === 'raw') return result;
			return Effect.map(result, (r) => r.rows);
		};

		return new EffectPostgresPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.options.logger,
			this.options.cache,
			queryMetadata,
			cacheConfig,
			shape,
			this.options.paramsInErrors,
		);
	}

	private query(
		sql: string,
		params: unknown[],
		mode: 'arrays' | 'objects' | 'raw',
		shape: ShapeSpec | undefined,
		name?: string,
	) {
		return this.client.query(sql, params, { name, mode: mode === 'arrays' ? 'array' : 'object', shape });
	}

	batch(queries: readonly BatchItem<'pg'>[]) {
		return this.client.batch(queries.map((query) => this.runBatchItem(query)));
	}

	pipeline(queries: readonly BatchItem<'pg'>[]) {
		return this.client.pipeline(queries.map((query) => Effect.result(this.runBatchItem(query))));
	}

	// Skips the logger and the cache: an async step before `client.query` would change the order of the
	// statements on the connection.
	private runBatchItem(item: BatchItem<'pg'>) {
		const prepared = item._prepare();
		if (!is(prepared, EffectPostgresPreparedQuery)) {
			return Effect.die(new Error('Only queries built by an EffectPostgresDatabase can run in a batch or a pipeline'));
		}
		const { sql, params } = prepared.getQuery();
		const { mode, mapper, shape } = prepared;

		return this.query(sql, params, mode, shape).pipe(
			Effect.flatMap((result) =>
				Effect.try({
					try: () => mapper ? mapper(result.rows) : mode === 'raw' ? result : result.rows,
					catch: (e) => e,
				})
			),
			Effect.mapError((e) =>
				new EffectDrizzleQueryError({
					query: sql,
					params: this.options.paramsInErrors ? params : undefined,
					cause: Cause.fail(e),
				})
			),
		);
	}

	bulkInsert(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: EffectPostgresBulkInsertOptions = {},
	) {
		return Effect.suspend(() => {
			if (rows.length === 0) {
				return Effect.succeed<PostgresBulkResult>({ rows: [], columns: [], rowCount: 0, command: 'INSERT' });
			}

			const bulk = buildBulkInsert(this.dialect, table, rows);
			return this.client.bulkInsert(bulk.table, bulk.columns, bulk.rows, { ...options, defaults: bulk.defaults }).pipe(
				Effect.tap(() => this.options.cache.onMutate({ tables: usedTablesOf(table) })),
			);
		});
	}

	bulkUpdate(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: EffectPostgresBulkUpdateOptions,
	) {
		return Effect.suspend(() => {
			if (rows.length === 0) {
				return Effect.succeed<PostgresBulkResult>({ rows: [], columns: [], rowCount: 0, command: 'UPDATE' });
			}

			const bulk = buildBulkUpdate(this.dialect, table, rows, options.by);
			return this.client.bulkUpdate(bulk.table, bulk.columns, bulk.rows, { ...options, by: bulk.by }).pipe(
				Effect.tap(() => this.options.cache.onMutate({ tables: usedTablesOf(table) })),
			);
		});
	}

	override transaction<A, E, R>(
		transaction: (tx: EffectPostgresTransaction<TRelations>) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectPostgresTransaction<TRelations>(dialect, this, relations);

			if (config) {
				for (const statement of tx.getTransactionConfigStatements(config)) {
					yield* this.client.unsafe(statement);
				}
			}

			return yield* transaction(tx);
		}));
	}
}

export class EffectPostgresTransaction<
	TRelations extends AnyRelations,
> extends PgEffectTransaction<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}
