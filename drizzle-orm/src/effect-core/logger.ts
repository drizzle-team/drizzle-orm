import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';

/**
 * Effect service for logging SQL queries in Drizzle ORM.
 *
 * By default, this service is a no-op (no logging occurs). Use `EffectLogger.layer`
 * to enable Effect-based logging, or `EffectLogger.fromDrizzle` to adapt a standard
 * Drizzle logger.
 *
 * @example
 * ```ts
 * // Use default (no logging)
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 *
 * // Enable Effect-based logging
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 *
 * // Use a custom Drizzle logger
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 * ```
 */
export class EffectLogger extends Effect.Service<EffectLogger>()('drizzle-orm/EffectLogger', {
	sync: () => {
		const logQuery = (_query: string, _params: unknown[]) => Effect.void;

		return { logQuery };
	},
	accessors: true,
}) {
	static readonly [entityKind]: string = this.Service._tag;

	/**
	 * Creates an EffectLogger instance from a standard Drizzle logger.
	 *
	 * @param logger - A Drizzle logger instance implementing the `Logger` interface.
	 * @returns A new EffectLogger that delegates to the provided Drizzle logger.
	 *
	 * @example
	 * ```ts
	 * const drizzleLogger = new DefaultLogger();
	 * const effectLogger = EffectLogger.fromDrizzle(drizzleLogger);
	 * ```
	 */
	static fromDrizzle(logger: Logger) {
		return new EffectLogger({
			logQuery: (query: string, params: unknown[]) => {
				return Effect.sync(() => logger.logQuery(query, params));
			},
		});
	}

	/**
	 * Creates a Layer that provides an EffectLogger from a standard Drizzle logger.
	 *
	 * @param logger - A Drizzle logger instance implementing the `Logger` interface.
	 * @returns A Layer that provides the EffectLogger service.
	 *
	 * @example
	 * ```ts
	 * const drizzleLogger = new DefaultLogger();
	 * const db = yield* PgDrizzle.make({ relations }).pipe(
	 *   Effect.provide(EffectLogger.layerFromDrizzle(drizzleLogger)),
	 *   Effect.provide(PgDrizzle.DefaultServices),
	 * );
	 * ```
	 */
	static layerFromDrizzle(logger: Logger) {
		return Layer.succeed(EffectLogger, EffectLogger.fromDrizzle(logger));
	}

	/**
	 * A Layer that provides an EffectLogger with Effect-based logging.
	 *
	 * This layer logs queries using `Effect.log()` with annotations for the query
	 * SQL and parameters. Use this when you want query logging integrated with
	 * Effect's logging infrastructure.
	 *
	 * @example
	 * ```ts
	 * const db = yield* PgDrizzle.make({ relations }).pipe(
	 *   Effect.provide(EffectLogger.layer),
	 *   Effect.provide(PgDrizzle.DefaultServices),
	 * );
	 * ```
	 */
	static layer = Layer.succeed(
		EffectLogger,
		new EffectLogger({
			logQuery: Effect.fn('EffectLogger.logQuery')(function*(query: string, params: unknown[]) {
				const stringifiedParams = params.map((p) => {
					try {
						return JSON.stringify(p);
					} catch {
						return String(p);
					}
				});
				yield* Effect.log().pipe(
					Effect.annotateLogs({
						query,
						params: stringifiedParams,
					}),
				);
			}),
		}),
	);
}
