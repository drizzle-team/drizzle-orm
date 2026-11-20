import { DrizzlePostgresHttpClient as Client } from '#postgres/effect/neon-http';
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
import { type EffectPostgresHttpSettledResponse, wrongKind } from './driver.ts';
import {
	type EffectPostgresHttpBatchOptions,
	type EffectPostgresHttpQueryEffectHKT,
	type EffectPostgresHttpQueryResultHKT,
	EffectPostgresHttpSession,
} from './session.ts';
import { createShapeGenerator } from './shape.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectPostgresNeonHttpDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPostgresHttpQueryEffectHKT, EffectPostgresHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPostgresNeonHttpDatabase';

	/** @internal */
	declare session: EffectPostgresHttpSession<TRelations>;

	/**
	 * Runs the queries in one transaction, in a single request
	 *
	 * A failing query fails the batch with it's `EffectDrizzleQueryError` and rolls back the entire batch
	 */
	batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: EffectPostgresHttpBatchOptions,
	): Effect.Effect<BatchResponse<T>, EffectDrizzleQueryError | SqlError> {
		return this.session.batch(batch, options) as Effect.Effect<BatchResponse<T>, EffectDrizzleQueryError | SqlError>;
	}

	// No `pipeline`: Neon's multi-statement endpoint always wraps the set in a transaction (that is `batch`)

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
 * Creates an EffectPostgresNeonHttpDatabase instance on top of Drizzle Postgres over Neon's SQL-over-HTTP endpoint.
 *
 * Requires `DrizzlePostgresHttpClient` (a Neon HTTP one), and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
 *
 * HTTP holds no session: there are no interactive transactions (`db.transaction` dies), use `db.batch` for an atomic
 * set of statements.
 *
 * @example
 * ```ts
 * import * as PostgresNeonHttpDrizzle from 'drizzle-orm/effect-drizzle-postgres/http/neon';
 * import { DrizzlePostgresHttpClient } from 'drizzle-orm/postgres/client/effect/neon-http';
 *
 * const db = yield* PostgresNeonHttpDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresNeonHttpDrizzle.DefaultServices),
 *   Effect.provide(DrizzlePostgresHttpClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) })),
 * );
 * ```
 */
export const make = Effect.fn('PostgresNeonHttpDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* Client.DrizzlePostgresHttpClient;
		if (client.kind !== 'neon') return yield* Effect.die(new Error(wrongKind('neon', client.kind)));
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
		const db = new EffectPostgresNeonHttpDatabase(dialect, session, relations) as EffectPostgresNeonHttpDatabase<
			TRelations
		>;

		return Object.assign(db, { $client: client });
	},
);

/**
 * Convenience function that creates an EffectPostgresNeonHttpDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzlePgConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
