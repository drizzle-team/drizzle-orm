import { DrizzlePostgresHttpClient as Client } from '#postgres/effect/http';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { EffectDrizzlePgConfig } from '~/pg-core/effect/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresCodecs } from './codecs.ts';
import {
	type EffectPostgresHttpBatchOptions,
	type EffectPostgresHttpQueryEffectHKT,
	type EffectPostgresHttpQueryResultHKT,
	EffectPostgresHttpSession,
	type EffectPostgresHttpSettledResponse,
	wrongKind,
} from './session.ts';
import { createShapeGenerator } from './shape.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectPostgresHttpDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPostgresHttpQueryEffectHKT, EffectPostgresHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPostgresHttpDatabase';

	/** @internal */
	declare session: EffectPostgresHttpSession<TRelations>;

	/**
	 * Runs the queries in one transaction, in a single request
	 *
	 * A failing query fails the batch with it's `EffectDrizzleQueryError` and rolls back the entire batch
	 *
	 * @example
	 * ```ts
	 * const [inserted, users] = yield* db.batch([db.insert(users).values({ name: 'John' }).returning(), db.select().from(users)]);
	 * ```
	 */
	batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: EffectPostgresHttpBatchOptions,
	): Effect.Effect<BatchResponse<T>, EffectDrizzleQueryError | SqlError> {
		return this.session.batch(batch, options) as Effect.Effect<BatchResponse<T>, EffectDrizzleQueryError | SqlError>;
	}

	/**
	 * Pipelines the queries back-to-back in a single request, without a transaction, so each commits on it's own
	 *
	 * A failing query does not fail the others: each gives it's own `Result`. Fails only when the request as a whole does
	 */
	pipeline<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Effect.Effect<EffectPostgresHttpSettledResponse<T>, SqlError> {
		return this.session.pipeline(batch) as Effect.Effect<EffectPostgresHttpSettledResponse<T>, SqlError>;
	}

	/**
	 * Runs the queries concurrently, each as it's own request, without a transaction
	 *
	 * Never fails because of a failing query: each gives it's own `Result`
	 */
	parallel<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Effect.Effect<EffectPostgresHttpSettledResponse<T>> {
		return this.session.parallel(batch) as Effect.Effect<EffectPostgresHttpSettledResponse<T>>;
	}
}

/**
 * Creates an EffectPostgresHttpDatabase instance on top of Drizzle Postgres over the httpostgres gateway. For Neon's
 * SQL-over-HTTP endpoint, use `drizzle-orm/postgres/effect/neon-http`.
 *
 * Requires `DrizzlePostgresHttpClient` (a gateway one), and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
 *
 * HTTP holds no session: there are no interactive transactions (`db.transaction` dies), use `db.batch` for an atomic
 * set of statements.
 *
 * @example
 * ```ts
 * import * as PostgresHttpDrizzle from 'drizzle-orm/postgres/effect/http';
 *
 * const db = yield* PostgresHttpDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresHttpDrizzle.DefaultServices),
 *   Effect.provide(PostgresHttpDrizzle.DrizzlePostgresHttpClient.layer({ url: process.env.DATABASE_HTTP_URL! })),
 * );
 * ```
 */
export const make = Effect.fn('PostgresHttpDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* Client.DrizzlePostgresHttpClient;
		if (client.kind !== 'gateway') return yield* Effect.die(new Error(wrongKind('gateway', client.kind)));
		const logger = yield* EffectLogger;

		const codecs = config.codecs ?? postgresCodecs;
		const dialect = new PgDialect({
			codecs,
			useJitMappers: jitCompatCheck(config.jit),
			shapeGenerator: createShapeGenerator(codecs),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPostgresHttpSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectPostgresHttpDatabase(dialect, session, relations) as EffectPostgresHttpDatabase<TRelations>;

		return Object.assign(db, { $client: client });
	},
);

/**
 * Convenience function that creates an EffectPostgresHttpDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzlePgConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
