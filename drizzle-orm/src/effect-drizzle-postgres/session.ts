import type { QueryResult, ShapeSpec } from '#postgres';
import { DrizzlePostgresClient as Client } from '#postgres/effect/core';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { BatchItem } from '~/batch.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind, is } from '~/entity.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import {
	PgEffectBoundQuery,
	PgEffectPreparedQuery,
	PgEffectSession,
	PgEffectTransaction,
} from '~/pg-core/effect/session.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { getTransactionConfigStatements, setTransactionSnapshotSQL } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import {
	buildBulkInsert,
	buildBulkUpdate,
	type PostgresBatchTransactionOptions,
	type PostgresBulkInsertOptions,
	type PostgresBulkResult,
	type PostgresBulkUpdateOptions,
} from '~/postgres/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
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
 * query with bound placeholder values (`.prepare().bind({ … })`). Prepared items run under their statement name,
 * so the server parses them once per connection and reuses the plan.
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

export type EffectPostgresSettledBatchResponse<T extends readonly EffectPostgresBatchItem[]> = {
	[K in keyof T]: Result.Result<EffectPostgresBatchItemResult<T[K]>, EffectDrizzleQueryError>;
};

/** The transaction settings of `batch`: `snapshot` needs `isolation: 'repeatable read' | 'serializable'` */
export type EffectPostgresBatchOptions = PostgresBatchTransactionOptions;

/** The Effect that runs a batch item, as it would run on it's own: under it's statement name, with it's bound values */
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
			const result = this.query(query.sql, params ?? [], mode, shape, queryName);

			if (mode === 'raw') return result;
			return Effect.map(result, (r) => r.rows);
		};

		return new PgEffectPreparedQuery<T, EffectPostgresQueryEffectHKT>(
			executor,
			query,
			mapper,
			mode,
			this.options.logger,
			this.options.paramsInErrors,
		);
	}

	private query(
		sql: string,
		params: unknown[],
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		shape: ShapeSpec | undefined,
		name?: string,
	) {
		return this.client.query(sql, params, { name, mode: mode === 'arrays' ? 'array' : 'object', shape });
	}

	/** Atomic: runs all queries in one transaction, every statement pipelined on one pooled connection */
	batch(
		queries: readonly EffectPostgresBatchItem[],
		options?: EffectPostgresBatchOptions,
	): Effect.Effect<unknown[], EffectDrizzleQueryError | SqlError> {
		return Effect.suspend(() => {
			const effects = queries.map(itemEffect);
			if (!options) return this.client.batch(effects);

			const { snapshot, ...transaction } = options;
			const statements = Effect.provideService(
				Effect.all(effects, { concurrency: 'unbounded' }),
				Client.Pipelined,
				true,
			);
			return this.client.withTransaction(
				typeof snapshot === 'string'
					? Effect.andThen(
						this.client.unsafe(this.dialect.sqlToQuery(setTransactionSnapshotSQL(snapshot)).sql),
						statements,
					)
					: statements,
				transaction,
			);
		});
	}

	/**
	 * Non-atomic: pipelines all queries on a single pooled connection, each in it's own autocommit
	 *
	 * A failing query does not fail the others: each gives it's own `Result`, in input order
	 */
	pipeline(
		queries: readonly EffectPostgresBatchItem[],
	): Effect.Effect<Result.Result<unknown, EffectDrizzleQueryError>[], SqlError> {
		return Effect.suspend(() => this.client.pipeline(queries.map((query) => Effect.result(itemEffect(query)))));
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

	override transaction<A, E, R>(
		transaction: (tx: EffectPostgresTransaction<TRelations>) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectPostgresTransaction<TRelations>(dialect, this, relations);

			if (config) {
				for (const statement of getTransactionConfigStatements(dialect, config)) {
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
