import { DrizzlePostgresClient as Client } from '#postgres/effect/core';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { DefaultServices } from '~/effect-core/defaults.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { EffectDrizzlePgConfig } from '~/pg-core/effect/utils.ts';
import type { PgTransactionConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { postgresCodecs } from '~/postgres/codecs.ts';
import type { PostgresBatchOptions, PostgresBulkInsertValue, PostgresBulkUpdateValue } from '~/postgres/session.ts';
import { createShapeGenerator } from '~/postgres/shape.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import {
	type EffectPostgresBatchItem,
	type EffectPostgresBatchResponse,
	type EffectPostgresBatchResponseWithMetrics,
	type EffectPostgresBulkInsertOptions,
	type EffectPostgresBulkUpdateOptions,
	type EffectPostgresPipelineResponse,
	type EffectPostgresQueryEffectHKT,
	type EffectPostgresQueryResultHKT,
	EffectPostgresSession,
	type EffectPostgresTransaction,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectPostgresDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPostgresDatabase';

	/** @internal */
	declare session: EffectPostgresSession<TRelations>;

	override transaction<A, E, R>(
		transaction: (tx: EffectPostgresTransaction<TRelations>) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction, config);
	}

	/**
	 * Runs multiple queries at once in a transaction, as the async driver's `batch` does: one round trip on one pooled
	 * connection
	 *
	 * A failing query fails the batch with it's error and rolls back the entire batch
	 *
	 * Takes query builders, prepared queries, and prepared queries with bound placeholder values. Prepared items run
	 * under their statement name, so they are parsed once per connection:
	 *
	 * ```ts
	 * const getUser = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('get_user');
	 * const [alice, bob] = yield* db.batch([getUser.bind({ id: 1 }), getUser.bind({ id: 2 })]);
	 * ```
	 *
	 * With `metrics` on, the response also carries the driver's telemetry for the batch as `response.metrics`.
	 */
	batch<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options: PostgresBatchOptions & { metrics: true | 'ms' | 'us' },
	): Effect.Effect<EffectPostgresBatchResponseWithMetrics<T>, EffectDrizzleQueryError>;
	batch<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Effect.Effect<EffectPostgresBatchResponse<T>, EffectDrizzleQueryError>;
	batch<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Effect.Effect<EffectPostgresBatchResponse<T>, EffectDrizzleQueryError> {
		return this.session.batch(batch, options) as Effect.Effect<EffectPostgresBatchResponse<T>, EffectDrizzleQueryError>;
	}

	/**
	 * Pipelines queries back-to-back on a single pooled connection, without a transaction, as the async driver's
	 * `pipeline` does
	 *
	 * Never fails because of a failing query: one Result per query, in input order. A failing query does not stop or
	 * roll back the others
	 */
	pipeline<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Effect.Effect<EffectPostgresPipelineResponse<T>> {
		return this.session.pipeline(batch) as Effect.Effect<EffectPostgresPipelineResponse<T>>;
	}

	/**
	 * Inserts rows in bulk as multi-row `values` statements, filling `$defaultFn` / `$onUpdateFn` like `db.insert(...)`
	 *
	 * A cell a row leaves out gets the column's database default, and a column no row sets is left out of the statement
	 *
	 * Atomic by default: rows are split into chunks pipelined in one transaction - pass `atomic: false` to commit per chunk
	 *
	 * @example
	 * ```ts
	 * yield* db.bulkInsert(users, [{ name: 'John' }, { name: 'Jane' }]);
	 * ```
	 */
	bulkInsert<TTable extends PgTable, R = never>(
		table: TTable,
		rows: readonly PostgresBulkInsertValue<TTable>[],
		options?: EffectPostgresBulkInsertOptions<R>,
	) {
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
	 * yield* db.bulkUpdate(users, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }], { by: users.id });
	 * ```
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
		return this.session.bulkUpdate(table, rows, options);
	}
}

/**
 * Creates an EffectPostgresDatabase instance on top of Drizzle Postgres.
 *
 * Requires `DrizzlePostgresClient`, and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
 *
 * @example
 * ```ts
 * import * as PostgresDrizzle from 'drizzle-orm/effect-drizzle-postgres';
 * import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect';
 *
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   Effect.provide(DrizzlePostgresClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) })),
 * );
 * ```
 */
export const make = Effect.fn('PostgresDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* Client.DrizzlePostgresClient;
		const logger = yield* EffectLogger;

		const codecs = config.codecs ?? postgresCodecs;
		const dialect = new PgDialect({
			codecs,
			useJitMappers: jitCompatCheck(config.jit),
			shapeGenerator: createShapeGenerator(codecs),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPostgresSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectPostgresDatabase(dialect, session, relations);

		return Object.assign(db, { $client: client });
	},
);

/**
 * Same as {@link make}, with `DefaultServices` provided. Only `DrizzlePostgresClient` is required.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzlePgConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
