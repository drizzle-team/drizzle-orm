import { DrizzlePostgresClient as Client } from '#postgres/effect/core';
import * as Effect from 'effect/Effect';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { EffectDrizzlePgConfig } from '~/pg-core/effect/utils.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { postgresShapeCodecs } from '~/postgres/codecs.ts';
import type { PostgresBulkInsertValue, PostgresBulkUpdateValue } from '~/postgres/session.ts';
import { createShapeGenerator } from '~/postgres/shape.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import {
	type EffectPostgresBulkInsertOptions,
	type EffectPostgresBulkUpdateOptions,
	type EffectPostgresQueryEffectHKT,
	type EffectPostgresQueryResultHKT,
	EffectPostgresSession,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectPostgresDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPostgresQueryEffectHKT, EffectPostgresQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPostgresDatabase';

	/** @internal */
	declare session: EffectPostgresSession<TRelations>;

	/**
	 * Runs the Effects in one transaction, with every statement pipelined on its connection
	 *
	 * A failing Effect fails the batch and rolls back the entire batch
	 *
	 * @example
	 * ```ts
	 * const [inserted, users] = yield* db.batch([db.insert(users).values({ name: 'John' }).returning(), db.select().from(users)]);
	 * ```
	 */
	batch<const Arg extends Iterable<Effect.Effect<any, any, any>>>(effects: Arg) {
		return this.session.batch(effects);
	}

	/**
	 * Runs the Effects concurrently on one pooled connection, without a transaction, so each statement commits on its own
	 *
	 * Every statement runs to the end, and the first failure in statement order fails the pipeline.
	 * Wrap an Effect in `Effect.result` to get its failure as a value instead.
	 */
	pipeline<const Arg extends Iterable<Effect.Effect<any, any, any>>>(effects: Arg) {
		return this.session.pipeline(effects);
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
 * Requires `DrizzlePostgresClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
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
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const codecs = config.codecs ?? postgresShapeCodecs;
		const dialect = new PgDialect({
			codecs,
			useJitMappers: jitCompatCheck(config.jit),
			shapeGenerator: createShapeGenerator(codecs),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPostgresSession(client, dialect, relations, {
			logger,
			cache,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectPostgresDatabase(dialect, session, relations);
		db.$cache.invalidate = cache.onMutate;

		return Object.assign(db, { $client: client });
	},
);

/**
 * Same as {@link make}, with `DefaultServices` provided. Only `DrizzlePostgresClient` is required.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzlePgConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
