import { DrizzleAuroraClient as Client } from '#postgres/effect/aurora';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { EffectDrizzlePgConfig } from '~/pg-core/effect/utils.ts';
import type { PgTransactionConfig } from '~/pg-core/session.ts';
import { PostgresAuroraDialect } from '~/postgres/aurora/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresAuroraCodecs } from './codecs.ts';
import {
	type EffectPostgresAuroraQueryEffectHKT,
	type EffectPostgresAuroraQueryResultHKT,
	EffectPostgresAuroraSession,
	type EffectPostgresAuroraTransaction,
} from './session.ts';
import { createShapeGenerator } from './shape.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectPostgresAuroraDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPostgresAuroraQueryEffectHKT, EffectPostgresAuroraQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPostgresAuroraDatabase';

	/** @internal */
	declare session: EffectPostgresAuroraSession<TRelations>;

	override transaction<A, E, R>(
		transaction: (tx: EffectPostgresAuroraTransaction<TRelations>) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction, config);
	}
}

/**
 * Creates an EffectPostgresAuroraDatabase instance on top of Drizzle Postgres's Aurora Data API client.
 *
 * Requires `DrizzleAuroraClient`, and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
 *
 * Driver quirks:
 * - `time` values are cut to milliseconds
 * - `timestamp` values with fractional seconds lose `BC`
 * - `null` elements of arrays are dropped (`[1, null, 3]` is returned as `[1, 3]`)
 *
 * Unsupported column types (throw on non-null values):
 * - `timetz`, `timestamptz` in `string` mode (converted to UTC, offset dropped)
 * - `bytea[]` (returned empty)
 *
 * @example
 * ```ts
 * import * as PostgresAuroraDrizzle from 'drizzle-orm/postgres/effect/aurora';
 *
 * const db = yield* PostgresAuroraDrizzle.make({ relations }).pipe(
 *   Effect.provide(PostgresAuroraDrizzle.DefaultServices),
 *   Effect.provide(PostgresAuroraDrizzle.DrizzleAuroraClient.layer({ resourceArn, secretArn, database })),
 * );
 * ```
 */
export const make = Effect.fn('PostgresAuroraDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* Client.DrizzleAuroraClient;
		const logger = yield* EffectLogger;

		const codecs = config.codecs ?? postgresAuroraCodecs;
		const dialect = new PostgresAuroraDialect({
			codecs,
			useJitMappers: jitCompatCheck(config.jit),
			shapeGenerator: createShapeGenerator(codecs),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPostgresAuroraSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectPostgresAuroraDatabase(dialect, session, relations) as EffectPostgresAuroraDatabase<
			TRelations
		>;

		return Object.assign(db, { $client: client });
	},
);

/**
 * Convenience function that creates an EffectPostgresAuroraDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzlePgConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
