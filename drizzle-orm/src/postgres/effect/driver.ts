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
import type { PostgresBatchOptions, PostgresBulkInsertValue, PostgresBulkUpdateValue } from '~/postgres/session.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresCodecs } from './codecs.ts';
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
	type EffectPostgresSettledBatchResponse,
	type EffectPostgresTransaction,
} from './session.ts';
import { createShapeGenerator } from './shape.ts';
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
	 * A failing query fails the batch with it's `EffectDrizzleQueryError` and rolls back the entire batch. An error of
	 * no query - a failed connection, the snapshot import, a deferred constraint at COMMIT - fails it with an `SqlError`
	 *
	 * Takes query builders, prepared queries, and prepared queries with bound placeholder values. Prepared items run
	 * under their statement name, so they are parsed once per connection:
	 *
	 * ```ts
	 * const getUser = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('get_user');
	 * const [alice, bob, inserted, allUsers] = yield* db.batch([
	 *   getUser.bind({ id: 1 }),
	 *   getUser.bind({ id: 2 }),
	 *   db.insert(users).values({ name: 'John' }).returning(),
	 *   db.select().from(users),
	 * ]);
	 * ```
	 *
	 * With `metrics` on, the response also carries the driver's telemetry for the batch as `response.metrics`.
	 */
	batch<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options: PostgresBatchOptions & { metrics: true | 'ms' | 'us' },
	): Effect.Effect<EffectPostgresBatchResponseWithMetrics<T>, EffectDrizzleQueryError | SqlError>;
	batch<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Effect.Effect<EffectPostgresBatchResponse<T>, EffectDrizzleQueryError | SqlError>;
	batch<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Effect.Effect<EffectPostgresBatchResponse<T>, EffectDrizzleQueryError | SqlError> {
		return this.session.batch(batch, options) as Effect.Effect<
			EffectPostgresBatchResponse<T>,
			EffectDrizzleQueryError | SqlError
		>;
	}

	/**
	 * Pipelines queries back-to-back on a single pooled connection, without a transaction, as the async driver's
	 * `pipeline` does
	 *
	 * Never fails because of a failing query: one Result per query, in input order. A failing query does not stop or
	 * roll back the others. Fails with an `SqlError` when there is no connection to run them on
	 *
	 * Takes the same items as `batch`:
	 *
	 * ```ts
	 * const getUser = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('get_user');
	 * const [alice, bob, inserted, allUsers] = yield* db.pipeline([
	 *   getUser.bind({ id: 1 }),
	 *   getUser.bind({ id: 2 }),
	 *   db.insert(users).values({ name: 'John' }).returning(),
	 *   db.select().from(users),
	 * ]);
	 * // each is a `Result`: `Result.isSuccess(alice) ? alice.success : alice.failure`
	 * ```
	 */
	pipeline<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Effect.Effect<EffectPostgresPipelineResponse<T>, SqlError> {
		return this.session.pipeline(batch) as Effect.Effect<EffectPostgresPipelineResponse<T>, SqlError>;
	}

	/**
	 * Runs queries concurrently, fanned out across pooled connections, without a transaction
	 *
	 * Never fails because of a failing query: each gives it's own `Result`
	 *
	 * Failing query does not stop or roll back the others
	 *
	 * Takes the same items as `batch`:
	 *
	 * ```ts
	 * const getUser = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('get_user');
	 * const [alice, bob, inserted, allUsers] = yield* db.parallel([
	 *   getUser.bind({ id: 1 }),
	 *   getUser.bind({ id: 2 }),
	 *   db.insert(users).values({ name: 'John' }).returning(),
	 *   db.select().from(users),
	 * ]);
	 * // each is a `Result`: `Result.isSuccess(alice) ? alice.success : alice.failure`
	 * ```
	 */
	parallel<U extends EffectPostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Effect.Effect<EffectPostgresSettledBatchResponse<T>> {
		return this.session.parallel(batch) as Effect.Effect<EffectPostgresSettledBatchResponse<T>>;
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
 * Every transport provides the same `DrizzlePostgresClient` service, so `make` is the same for all of them: only the
 * client's layer differs. Each transport's layer is in an entry point of it's own, so importing this one loads no
 * other transport, and no PGlite.
 *
 * @example Node, Bun, Deno, Cloudflare Workers: the client of this entry point dials with the runtime's sockets
 * ```ts
 * import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
 *
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   Effect.provide(PostgresDrizzle.DrizzlePostgresClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) })),
 * );
 * ```
 *
 * @example A runtime's client by name, for bundlers that apply no runtime conditions: `node` (Node, Bun), `deno`, `cf`
 * ```ts
 * import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
 * import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect/cf';
 *
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   Effect.provide(DrizzlePostgresClient.layer({ url: Redacted.make(env.DATABASE_URL) })),
 * );
 * ```
 *
 * @example Neon over it's WebSocket proxy: prepared statements, pipelining and interactive transactions, as over TCP
 * ```ts
 * import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
 * import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect/neon-ws';
 *
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   // the global `WebSocket`: on Node < 22, pass `webSocketConstructor` (the `ws` package's)
 *   Effect.provide(DrizzlePostgresClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) })),
 * );
 * ```
 *
 * @example PGlite: an in-process Postgres, which stays yours (closing the layer leaves it open)
 * ```ts
 * import { PGlite } from '@electric-sql/pglite';
 * import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
 * import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect/pglite';
 *
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   Effect.provide(DrizzlePostgresClient.layer(new PGlite())), // or `new PGlite('./data')`
 * );
 * ```
 *
 * @example A transport of your own: the core client dials with the `DrizzlePostgresTransport` in context
 * ```ts
 * import * as Layer from 'effect/Layer';
 * import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
 * import { DrizzlePostgresClient, DrizzlePostgresTransport } from 'drizzle-orm/postgres/client/effect/core';
 *
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   Effect.provide(
 *     DrizzlePostgresClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) }).pipe(
 *       Layer.provide(Layer.succeed(DrizzlePostgresTransport.DrizzlePostgresTransport, { connect, cancel })),
 *     ),
 *   ),
 * );
 * ```
 *
 * @example A pool you already have, from any of the above: the layer uses it as it is, and leaves it open
 * ```ts
 * import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
 * import { createPool } from 'drizzle-orm/postgres/client/node';
 *
 * const pool = createPool(process.env.DATABASE_URL!);
 * const db = yield* PostgresDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresDrizzle.DefaultServices),
 *   Effect.provide(PostgresDrizzle.DrizzlePostgresClient.layerFromPool(pool)),
 * );
 * ```
 *
 * Aurora's Data API, the HTTP gateway and Neon's HTTP endpoint have entry points of their own:
 * `drizzle-orm/postgres/effect/aurora`, `drizzle-orm/postgres/effect/http` and `drizzle-orm/postgres/effect/neon-http`.
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
