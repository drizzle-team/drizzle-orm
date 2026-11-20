import type { BatchMetrics, QueryResult, ShapeSpec } from '#postgres';
import { DrizzlePostgresClient as Client } from '#postgres/effect/core';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { BatchItem } from '~/batch.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind, is } from '~/entity.ts';
import { mapBatchResults, mapSettledResults } from '~/pg-core/async/session.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import {
	PgEffectBoundQuery,
	PgEffectPreparedQuery,
	PgEffectSession,
	PgEffectTransaction,
} from '~/pg-core/effect/session.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { setTransactionSnapshotSQL } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import {
	batchItemParams,
	buildBulkInsert,
	buildBulkUpdate,
	buildPoolQueries,
	type PostgresBatchOptions,
	type PostgresBulkInsertOptions,
	type PostgresBulkInsertValue,
	type PostgresBulkResult,
	type PostgresBulkUpdateOptions,
	type PostgresBulkUpdateValue,
	type PostgresMultiPrepared,
} from '~/postgres/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import { effectQueryRuntime } from '~/runtime/effect.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';

export interface EffectPostgresQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export interface EffectPostgresQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<PgRawRow<this['row']>>, 'metrics' | 'debug'>>;
}

/** The async options without the ones that Effect replaces, with `onProgress` as an Effect that needs `R` */
export type EffectPostgresBulkInsertOptions<R = never> =
	& Omit<PostgresBulkInsertOptions, 'timeout' | 'signal' | 'onProgress'>
	& Pick<Client.BulkInsertOptions<R>, 'onProgress'>;

export type EffectPostgresBulkUpdateOptions<TBy = PgColumn | readonly [PgColumn, ...PgColumn[]], R = never> =
	& Omit<PostgresBulkUpdateOptions<TBy>, 'timeout' | 'signal' | 'onProgress'>
	& Pick<Client.BulkUpdateOptions<R>, 'onProgress'>;

/**
 * One item of `batch`, `pipeline` or `parallel`: a query builder, a prepared query (`.prepare()`), or a prepared
 * query with bound placeholder values (`.prepare().bind({ … })`), the items the async driver takes. Prepared items
 * run under their statement name, so the server parses them once per connection and reuses the plan.
 */
export type EffectPostgresBatchItem =
	| BatchItem<'pg'>
	| PgEffectPreparedQuery<any, any>
	| PgEffectBoundQuery<any, any>;

/** What one {@link EffectPostgresBatchItem} gives, the same value running it on it's own would give. */
export type EffectPostgresBatchItemResult<TItem> = TItem extends { readonly _: { readonly result: infer TResult } }
	? TResult
	: TItem extends { readonly prepared: { execute(...args: any[]): Effect.Effect<infer TResult, any, any> } } ? TResult
	: TItem extends { execute(...args: any[]): Effect.Effect<infer TResult, any, any> } ? TResult
	: never;

export type EffectPostgresBatchResponse<T extends readonly EffectPostgresBatchItem[]> = {
	[K in keyof T]: EffectPostgresBatchItemResult<T[K]>;
};

/** A batch's results together with the driver's telemetry for it, when `metrics` is on. */
export type EffectPostgresBatchResponseWithMetrics<T extends readonly EffectPostgresBatchItem[]> =
	& EffectPostgresBatchResponse<T>
	& { metrics: BatchMetrics };

/** One Result per statement of a `pipeline` or `parallel`: it's value, or the error it failed with */
export type EffectPostgresSettledBatchResponse<T extends readonly EffectPostgresBatchItem[]> = {
	[K in keyof T]: Result.Result<EffectPostgresBatchItemResult<T[K]>, EffectDrizzleQueryError>;
};

export type EffectPostgresPipelineResponse<T extends readonly EffectPostgresBatchItem[]> =
	EffectPostgresSettledBatchResponse<T>;

/** The options of `batch`, the async driver's: `snapshot` needs `isolation: 'repeatable read' | 'serializable'` */
export type EffectPostgresBatchOptions = PostgresBatchOptions;

/** The Effect that runs an item of `parallel`, as it would run on it's own: under it's statement name, with it's bound values */
function itemEffect(item: EffectPostgresBatchItem): Effect.Effect<unknown, EffectDrizzleQueryError> {
	const effect = is(item, PgEffectBoundQuery)
		? item.prepared.execute(item.placeholderValues)
		: is(item, PgEffectPreparedQuery)
		? item.execute()
		: ((item as BatchItem<'pg'>)._prepare() as PgEffectPreparedQuery<any>).execute();
	return effect as Effect.Effect<unknown, EffectDrizzleQueryError>;
}

export interface EffectPostgresSessionOptions {
	logger: EffectLoggerShape;
	paramsInErrors?: boolean;
}

export class EffectPostgresPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgEffectPreparedQuery<T, TEffectHKT> {
	static override readonly [entityKind]: string = 'EffectPostgresPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: EffectLoggerShape,
		readonly shape: ShapeSpec | undefined,
		paramsInErrors: boolean | undefined,
		/** The server-side prepared statement name, when the query was created with `.prepare()` */
		readonly name: string | undefined,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}
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
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		shape?: ShapeSpec,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = (params?: unknown[]) => {
			const result = this.client.query(query.sql, params ?? [], {
				name: queryName,
				mode: mode === 'arrays' ? 'array' : 'object',
				shape,
			});

			if (mode === 'raw') return result;
			return Effect.map(result, (r) => r.rows);
		};

		return new EffectPostgresPreparedQuery<T, EffectPostgresQueryEffectHKT>(
			executor,
			query,
			mapper,
			mode,
			this.options.logger,
			shape,
			this.options.paramsInErrors,
			queryName,
		);
	}

	/**
	 * The items as the pool's queries, built and logged as the async driver does. Inside a transaction there is no
	 * pool to run them on, as for the async driver's transaction.
	 */
	private buildMulti(method: 'batch' | 'pipeline', queries: readonly EffectPostgresBatchItem[]) {
		return Effect.withFiber((fiber) => {
			const inTransaction = Context.getOrUndefined(fiber.context, this.client.transactionService) !== undefined;
			const logged: [sql: string, params: unknown[]][] = [];
			const multi = buildPoolQueries(
				inTransaction ? undefined : this.client.pool,
				method,
				queries,
				(sql, params) => logged.push([sql, params]),
			);
			return Effect.as(
				Effect.forEach(logged, ([sql, params]) => this.options.logger.logQuery(sql, params), { discard: true }),
				multi,
			);
		});
	}

	/** A query's error, with the driver's error as an `SqlError`, as a query run on it's own gives it */
	private queryError(
		prepared: PostgresMultiPrepared,
		cause: unknown,
		item: EffectPostgresBatchItem,
		operation: 'batch' | 'pipeline',
	) {
		return effectQueryRuntime.queryError(
			prepared.getQuery().sql,
			this.options.paramsInErrors ? batchItemParams(prepared, item) : undefined,
			Client.toSqlError(cause, operation),
		) as EffectDrizzleQueryError;
	}

	/**
	 * Atomic: runs all queries in one transaction on a single pooled connection
	 *
	 * A query's error fails it as an `EffectDrizzleQueryError`. An error of no query, such as a failed connection, the
	 * snapshot import or a deferred constraint at COMMIT, fails it as an `SqlError`
	 */
	batch(
		queries: readonly EffectPostgresBatchItem[],
		options?: PostgresBatchOptions,
	): Effect.Effect<any[], EffectDrizzleQueryError | SqlError> {
		return Effect.flatMap(this.buildMulti('batch', queries), ({ pool, prepared, built }) =>
			Effect.tryPromise({
				try: () =>
					pool.batch(built, options as Parameters<typeof pool.batch>[1]).then((results) => {
						const response = mapBatchResults(prepared as any[], results);
						if (results.metrics) (response as { metrics?: BatchMetrics }).metrics = results.metrics;
						return response;
					}),
				catch: (e) => {
					const index = (e as { failedQueryIndex?: unknown } | null)?.failedQueryIndex;
					const query = typeof index === 'number' ? prepared[index] : undefined;
					// An error of no query has none to attach to
					if (!query) return Client.toSqlError(e, 'batch');
					return this.queryError(query, e, queries[index as number]!, 'batch');
				},
			}));
	}

	/**
	 * Non-atomic: pipelines all queries on a single pooled connection, each in it's own autocommit
	 *
	 * Never fails on a query failure: one Result per query, in input order. Fails with an `SqlError` when there is no
	 * connection to run them on
	 */
	pipeline(
		queries: readonly EffectPostgresBatchItem[],
	): Effect.Effect<Result.Result<any, EffectDrizzleQueryError>[], SqlError> {
		return Effect.flatMap(
			this.buildMulti('pipeline', queries),
			({ pool, prepared, built }) =>
				Effect.tryPromise({
					try: () =>
						pool.pipeline(built).then((results) =>
							mapSettledResults(
								prepared as any[],
								results,
								(i, cause) => this.queryError(prepared[i]!, cause, queries[i]!, 'pipeline') as any,
							).map((settled) =>
								settled.status === 'fulfilled'
									? Result.succeed(settled.value)
									: Result.fail(settled.reason as unknown as EffectDrizzleQueryError)
							)
						),
					catch: (e) => Client.toSqlError(e, 'pipeline'),
				}),
		);
	}

	/**
	 * Non-atomic: fans queries out across pooled connections concurrently. Inside a transaction the queries share it's
	 * connection, so they run one at a time
	 *
	 * A failing query does not fail the others: each gives it's own `Result`, in input order
	 */
	parallel(
		queries: readonly EffectPostgresBatchItem[],
	): Effect.Effect<Result.Result<unknown, EffectDrizzleQueryError>[]> {
		return Effect.flatMap(
			Effect.serviceOption(this.client.transactionService),
			(tx) =>
				Effect.forEach(queries, (query) => Effect.result(itemEffect(query)), {
					concurrency: Option.isSome(tx) ? 1 : 'unbounded',
				}),
		);
	}

	bulkInsert<R = never>(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: EffectPostgresBulkInsertOptions<R> = {},
	) {
		return Effect.suspend(() => {
			if (rows.length === 0) {
				return Effect.succeed<PostgresBulkResult>({ rows: [], columns: [], rowCount: 0, command: 'INSERT' });
			}

			const bulk = buildBulkInsert(this.dialect, table, rows);
			return this.client.bulkInsert(bulk.table, bulk.columns, bulk.rows, { ...options, defaults: true });
		});
	}

	bulkUpdate<R = never>(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: EffectPostgresBulkUpdateOptions<PgColumn | readonly [PgColumn, ...PgColumn[]], R>,
	) {
		return Effect.suspend(() => {
			if (rows.length === 0) {
				return Effect.succeed<PostgresBulkResult>({ rows: [], columns: [], rowCount: 0, command: 'UPDATE' });
			}

			const bulk = buildBulkUpdate(this.dialect, table, rows, options.by);
			return this.client.bulkUpdate(bulk.table, bulk.columns, bulk.rows, { ...options, by: bulk.by });
		});
	}

	/** As the async driver's transaction: the same settings go to the driver, and a snapshot is set inside */
	override transaction<A, E, R>(
		transaction: (tx: EffectPostgresTransaction<TRelations>) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(
			Effect.gen({ self: this }, function*() {
				const tx = new EffectPostgresTransaction<TRelations>(dialect, this, relations);

				if (typeof config?.snapshot === 'string') {
					yield* this.client.query(dialect.sqlToQuery(setTransactionSnapshotSQL(config.snapshot)).sql, [], {
						mode: 'object',
					});
				}

				return yield* transaction(tx);
			}),
			{
				deferrable: config?.deferrable,
				isolation: config?.isolationLevel,
				readOnly: config?.accessMode === 'read only',
			},
		);
	}
}

export class EffectPostgresTransaction<
	TRelations extends AnyRelations,
> extends PgEffectTransaction<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresTransaction';

	/** @internal */
	declare session: EffectPostgresSession<TRelations>;

	override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}

	/**
	 * Inserts rows in bulk as multi-row `values` statements, filling `$defaultFn` / `$onUpdateFn` like `tx.insert(...)`
	 *
	 * A cell a row leaves out gets the column's database default, and a column no row sets is left out of the statement
	 */
	bulkInsert<TTable extends PgTable, R = never>(
		table: TTable,
		rows: readonly PostgresBulkInsertValue<TTable>[],
		options?: EffectPostgresBulkInsertOptions<R>,
	) {
		return this.session.bulkInsert(table, rows, options);
	}

	/**
	 * Updates rows in bulk via driver-side `unnest`, matched by `by` key column(s), filling `$onUpdateFn` like `tx.update(...)`
	 *
	 * Every row must set the same columns, except for the ones filled by `$onUpdateFn`
	 */
	bulkUpdate<
		TTable extends PgTable,
		TBy extends
			| TTable['_']['columns'][keyof TTable['_']['columns']]
			| readonly [
				TTable['_']['columns'][keyof TTable['_']['columns']],
				...TTable['_']['columns'][keyof TTable['_']['columns']][],
			],
		R = never,
	>(
		table: TTable,
		rows: readonly PostgresBulkUpdateValue<TTable, TBy>[],
		options: EffectPostgresBulkUpdateOptions<TBy, R>,
	) {
		return this.session.bulkUpdate(table, rows, options as EffectPostgresBulkUpdateOptions<any, R>);
	}
}
