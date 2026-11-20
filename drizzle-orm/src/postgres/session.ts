import type { BatchMetrics, Connection, Pool, QueryResult, ShapeSpec } from '#postgres';
import type { BatchItem, SettledQueryResult } from '~/batch.ts';
import type { GetColumnData } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import {
	type PgAsyncBoundQuery,
	PgAsyncPreparedQuery,
	PgAsyncSession,
	PgAsyncTransaction,
} from '~/pg-core/async/session.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import {
	mapBatchResults,
	mapSettledResults,
	type PgBasePreparedQuery,
	setTransactionSnapshotSQL,
} from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { InferInsertModel } from '~/table.ts';
import type { Simplify } from '~/utils.ts';
import { batchItemParams, buildBulkInsert, buildBulkUpdate, buildPoolQueries } from './utils.ts';

export type PostgresClient = Pool | Connection;

export type PostgresBulkInsertOptions = Pick<
	NonNullable<Parameters<Pool['bulkInsert']>[3]>,
	'chunk' | 'atomic' | 'onProgress' | 'timeout' | 'signal'
>;

export type PostgresBulkUpdateOptions<TBy = PgColumn | readonly [PgColumn, ...PgColumn[]]> =
	& Pick<
		Parameters<Pool['bulkUpdate']>[3],
		'chunk' | 'atomic' | 'onProgress' | 'timeout' | 'signal'
	>
	& {
		by: TBy;
	};

export type PostgresBulkInsertValue<TTable extends PgTable> = InferInsertModel<TTable>;

export type PostgresBulkKeys<TTable extends PgTable, TBy> = {
	[K in keyof TTable['_']['columns'] & string]: TTable['_']['columns'][K] extends
		(TBy extends readonly unknown[] ? TBy[number] : TBy) ? K
		: never;
}[keyof TTable['_']['columns'] & string];

export type PostgresBulkUpdateValue<TTable extends PgTable, TBy> = Simplify<
	& {
		[K in PostgresBulkKeys<TTable, TBy>]: GetColumnData<TTable['_']['columns'][K], 'raw'>;
	}
	& {
		[K in Exclude<keyof InferInsertModel<TTable> & string, PostgresBulkKeys<TTable, TBy>>]?:
			| GetColumnData<TTable['_']['columns'][K]>
			| undefined;
	}
>;

export type PostgresBulkResult = Omit<QueryResult<never>, 'metrics' | 'debug'>;

export type PostgresBatchOptions = PostgresBatchTransactionOptions & {
	/**
	 * Return the batch's telemetry from the driver as `response.metrics`: each query's metrics plus what the batch
	 * did as a whole, such as it's network round trips and how many statements the server parsed or reused.
	 * `true` gives milliseconds as floats, `'ms'` whole milliseconds, `'us'` whole microseconds.
	 */
	metrics?: boolean | 'ms' | 'us';
};

export type PostgresBatchTransactionOptions =
	| {
		/** `snapshot` cannot be used with `isolation: 'read uncommitted' | 'read committed'` */
		isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted';
		readOnly?: boolean;
		deferrable?: boolean;
		snapshot?: undefined;
	}
	| {
		/** `snapshot` needs `isolation: 'repeatable read' | 'serializable'` */
		isolation: 'serializable' | 'repeatable read';
		readOnly?: boolean;
		deferrable?: boolean;
		/** Run the transaction on a snapshot exported by another transaction (`pg_export_snapshot()`) */
		snapshot: string;
	};

/**
 * One item of `batch`, `pipeline` or `parallel`: a query builder, a prepared query (`.prepare()`), or a prepared
 * query with bound placeholder values (`.prepare().bind({ … })`). Prepared items run under their statement name,
 * so the server parses them once per connection and reuses the plan.
 */
export type PostgresBatchItem = BatchItem<'pg'> | PgAsyncPreparedQuery<any> | PgAsyncBoundQuery<any>;

/** What one {@link PostgresBatchItem} resolves to, the same value awaiting it on it's own would give. */
export type PostgresBatchItemResult<TItem> = TItem extends { readonly _: { readonly result: infer TResult } } ? TResult
	: TItem extends { readonly prepared: { execute(...args: any[]): Promise<infer TResult> } } ? TResult
	: TItem extends { execute(...args: any[]): Promise<infer TResult> } ? TResult
	: never;

export type PostgresBatchResponse<T extends readonly PostgresBatchItem[]> = {
	[K in keyof T]: PostgresBatchItemResult<T[K]>;
};

/** A batch's results together with the driver's telemetry for it, when `metrics` is on. */
export type PostgresBatchResponseWithMetrics<T extends readonly PostgresBatchItem[]> = PostgresBatchResponse<T> & {
	metrics: BatchMetrics;
};

export type PostgresSettledBatchResponse<T extends readonly PostgresBatchItem[]> = {
	[K in keyof T]: SettledQueryResult<PostgresBatchItemResult<T[K]>>;
};

export interface PostgresSessionOptions {
	logger?: Logger;
	paramsInErrors?: boolean;
}

/** A prepared query of either runtime of the `drizzle-orm/postgres` drivers, with what the pool needs from it */
export interface PostgresMultiPrepared extends PgBasePreparedQuery {
	/** The server-side prepared statement name, when the query was created with `.prepare()` */
	readonly name?: string;
	readonly shape?: ShapeSpec;
}

export class PostgresSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresSession';

	private logger: Logger;

	constructor(
		private client: PostgresClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: PostgresSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		shape?: ShapeSpec,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'array', shape },
				)
				: this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'object', shape },
				);

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
		};

		return new PostgresPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			shape,
			this.options.paramsInErrors,
			queryName,
		);
	}

	/** Atomic: runs all queries in one transaction on a single pooled connection */
	async batch<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresBatchOptions,
	): Promise<any[]> {
		const { pool, prepared, built } = this.buildMulti('batch', queries);
		return pool.batch(built, options).catch((e) => {
			const index = (e as { failedQueryIndex?: unknown } | null)?.failedQueryIndex;
			const query = typeof index === 'number' ? prepared[index] : undefined;
			if (!query) throw e;
			throw this.queryError(query, e, queries[index as number]!);
		}).then((results) => {
			const response = mapBatchResults(prepared, results);
			if (results.metrics) (response as { metrics?: BatchMetrics }).metrics = results.metrics;

			return response;
		});
	}

	/**
	 * Non-atomic: pipelines all queries on a single pooled connection, each in it's own autocommit
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async pipeline<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	): Promise<SettledQueryResult<any>[]> {
		const { pool, prepared, built } = this.buildMulti('pipeline', queries);
		return pool.pipeline(built).then((results) =>
			mapSettledResults(prepared, results, (i, cause) => this.queryError(prepared[i]!, cause, queries[i]!))
		);
	}

	/**
	 * Non-atomic: fans queries out across pooled connections concurrently
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async parallel<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	): Promise<SettledQueryResult<any>[]> {
		const { pool, prepared, built } = this.buildMulti('parallel', queries);
		return pool.parallel(built).then((results) =>
			mapSettledResults(prepared, results, (i, cause) => this.queryError(prepared[i]!, cause, queries[i]!))
		);
	}

	async bulkInsert(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: PostgresBulkInsertOptions = {},
	): Promise<PostgresBulkResult> {
		if (rows.length === 0) return { rows: [], columns: [], rowCount: 0, command: 'INSERT' };

		const bulk = buildBulkInsert(this.dialect, table, rows);
		return this.client.bulkInsert(bulk.table, bulk.columns, bulk.rows, { ...options, defaults: true });
	}

	async bulkUpdate(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: PostgresBulkUpdateOptions,
	): Promise<PostgresBulkResult> {
		if (rows.length === 0) return { rows: [], columns: [], rowCount: 0, command: 'UPDATE' };

		const bulk = buildBulkUpdate(this.dialect, table, rows, options.by);
		return this.client.bulkUpdate(bulk.table, bulk.columns, bulk.rows, {
			...options,
			by: bulk.by,
		});
	}

	private queryError(prepared: PostgresMultiPrepared, cause: unknown, item: PostgresBatchItem): DrizzleQueryError {
		return new DrizzleQueryError(
			prepared.getQuery().sql,
			this.options.paramsInErrors ? batchItemParams(prepared, item) : undefined,
			cause as Error,
		);
	}

	private buildMulti(method: 'batch' | 'pipeline' | 'parallel', queries: Readonly<PostgresBatchItem[]>) {
		const { pool, prepared, built } = buildPoolQueries(
			this.client,
			method,
			queries,
			(sql, params) => this.logger.logQuery(sql, params),
		);
		return { pool, prepared: prepared as PgAsyncPreparedQuery<any>[], built };
	}

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return this.client.transaction({
			deferrable: config?.deferrable,
			isolation: config?.isolationLevel,
			readOnly: config?.accessMode === 'read only',
		}, async (clTx) => {
			const session = new PostgresSession(clTx, this.dialect, this.relations, this.options);
			const tx = new PostgresTransaction<TRelations>(
				this.dialect,
				session,
				this.relations,
				undefined,
				false,
			);

			if (typeof config?.snapshot === 'string') {
				await tx.execute(setTransactionSnapshotSQL(config.snapshot));
			}

			return transaction(tx);
		});
	}
}

export class PostgresTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresTransaction';

	/** @internal */
	declare session: PostgresSession<TRelations>;

	/**
	 * Inserts rows in bulk as multi-row `values` statements, filling `$defaultFn` / `$onUpdateFn` like `tx.insert(...)`
	 *
	 * A cell a row leaves out gets the column's database default, and a column no row sets is left out of the statement
	 */
	async bulkInsert<TTable extends PgTable>(
		table: TTable,
		rows: readonly PostgresBulkInsertValue<TTable>[],
		options?: PostgresBulkInsertOptions,
	): Promise<PostgresBulkResult> {
		return this.session.bulkInsert(table, rows, options);
	}

	/**
	 * Updates rows in bulk via driver-side `unnest`, matched by `by` key column(s), filling `$onUpdateFn` like `tx.update(...)`
	 *
	 * Every row must set the same columns, except for the ones filled by `$onUpdateFn`
	 */
	async bulkUpdate<
		TTable extends PgTable,
		TBy extends
			| TTable['_']['columns'][keyof TTable['_']['columns']]
			| readonly [
				TTable['_']['columns'][keyof TTable['_']['columns']],
				...TTable['_']['columns'][keyof TTable['_']['columns']][],
			],
	>(
		table: TTable,
		rows: readonly PostgresBulkUpdateValue<TTable, TBy>[],
		options: PostgresBulkUpdateOptions<TBy>,
	): Promise<PostgresBulkResult> {
		return this.session.bulkUpdate(table, rows, options as PostgresBulkUpdateOptions<any>);
	}

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.session.transaction(transaction as any);
	}
}

export type PostgresQueryResult<T> = Omit<QueryResult<T>, 'metrics' | 'debug'>;

export interface PostgresQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<PgRawRow<this['row']>>, 'metrics' | 'debug'>>;
}

export class PostgresPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: Logger,
		readonly shape?: ShapeSpec,
		paramsInErrors?: boolean,
		/** The server-side prepared statement name, when the query was created with `.prepare()` */
		readonly name?: string,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}
}
