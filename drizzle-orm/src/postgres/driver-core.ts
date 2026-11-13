import type { Pool } from '#postgres';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { PgTransactionConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresShapeCodecs } from './codecs.ts';
import type {
	PostgresBatchItem,
	PostgresBatchOptions,
	PostgresBatchResponse,
	PostgresBatchResponseWithMetrics,
	PostgresBulkInsertOptions,
	PostgresBulkInsertValue,
	PostgresBulkResult,
	PostgresBulkUpdateOptions,
	PostgresBulkUpdateValue,
	PostgresClient,
	PostgresQueryResultHKT,
	PostgresSettledBatchResponse,
	PostgresTransaction,
} from './session.ts';
import { PostgresSession } from './session.ts';
import { createShapeGenerator } from './shape.ts';

export class PostgresDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresDatabase';

	/** @internal */
	declare session: PostgresSession<TRelations>;

	override transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}

	/**
	 * Runs multiple queries at once in transaction
	 *
	 * Failing query will throw, stop remaining queries and roll back entire batch
	 *
	 * Takes query builders, prepared queries, and prepared queries with bound placeholder values. Prepared items
	 * run under their statement name, so they are parsed once per connection:
	 *
	 * ```ts
	 * const getUser = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('get_user');
	 * const [alice, bob] = await db.batch([getUser.bind({ id: 1 }), getUser.bind({ id: 2 })]);
	 * ```
	 *
	 * With `metrics` on, the response also carries the driver's telemetry for the batch as `response.metrics`.
	 */
	async batch<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options: PostgresBatchOptions & { metrics: true | 'ms' | 'us' },
	): Promise<PostgresBatchResponseWithMetrics<T>>;
	async batch<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Promise<PostgresBatchResponse<T>>;
	async batch<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Promise<PostgresBatchResponse<T>> {
		return this.session.batch(batch, options) as Promise<PostgresBatchResponse<T>>;
	}

	/**
	 * Pipelines queries back-to-back on a single pooled connection, without a transaction
	 *
	 * Never throws because of a failing query
	 *
	 * Failing query does not stop or roll back the others
	 */
	async pipeline<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<PostgresSettledBatchResponse<T>> {
		return this.session.pipeline(batch) as Promise<PostgresSettledBatchResponse<T>>;
	}

	/**
	 * Runs queries concurrently, fanned out across pooled connections, without a transaction
	 *
	 * Never throws because of a failing query
	 *
	 * Failing query does not stop or roll back the others
	 */
	async parallel<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<PostgresSettledBatchResponse<T>> {
		return this.session.parallel(batch) as Promise<PostgresSettledBatchResponse<T>>;
	}

	/**
	 * Inserts rows in bulk via driver-side `unnest`, filling `$defaultFn` / `$onUpdateFn` like `db.insert(...)`
	 *
	 * Falls back to a multi-row `values` insert when cells are left to the database default in some rows only,
	 * or when a column's type can't be sent as an `unnest` array (arrays, enums, custom types, etc.)
	 *
	 * Atomic by default: rows are split into chunks pipelined in one transaction - pass `atomic: false` to commit per chunk
	 *
	 * @example
	 * ```ts
	 * await db.bulkInsert(users, [{ name: 'John' }, { name: 'Jane' }]);
	 * ```
	 */
	async bulkInsert<TTable extends PgTable>(
		table: TTable,
		rows: readonly PostgresBulkInsertValue<TTable>[],
		options?: PostgresBulkInsertOptions,
	): Promise<PostgresBulkResult> {
		return this.session.bulkInsert(table, rows, options);
	}

	/**
	 * Updates rows in bulk via driver-side `unnest`, matched by `by` key column(s), filling `$onUpdateFn` like `db.update(...)`
	 *
	 * Every row must set the same columns, except for the ones filled by `$onUpdateFn`
	 *
	 * Atomic by default: rows are split into chunks pipelined in one transaction - pass `atomic: false` to commit per chunk
	 *
	 * @example
	 * ```ts
	 * await db.bulkUpdate(users, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }], { by: users.id });
	 * ```
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
}

/** @internal */
export function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = PostgresClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresDatabase<TRelations> & {
	$client: PostgresClient extends TClient ? Pool : TClient;
} {
	const codecs = config.codecs ?? postgresShapeCodecs;
	const dialect = new PgDialect({
		codecs,
		useJitMappers: jitCompatCheck(config.jit),
		shapeGenerator: createShapeGenerator(codecs),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new PostgresSession(client, dialect, relations, {
		logger,
		cache: config.cache,
		paramsInErrors: config.paramsInErrors,
	});

	const db = new PostgresDatabase(
		dialect,
		session,
		relations,
	) as PostgresDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
