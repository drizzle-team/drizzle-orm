import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { SQL } from '~/sql/sql.ts';
import { hasTelemetry } from '~/tracing.ts';
import type { MigrationRunner } from '~/up-migrations/utils.ts';
import { type QueryProgram, type QueryRuntime, runProgram, tracedSpan } from './core.ts';

type AnyEffect = Effect.Effect<unknown, unknown, unknown>;

/** A plain value returned where an Effect is expected, as {@link QueryRuntime}'s `suspend` and `andThen` allow */
const lift = (value: unknown): AnyEffect => Effect.isEffect(value) ? value : Effect.succeed(value);

export const effectQueryRuntime: QueryRuntime = {
	suspend: (body) => Effect.suspend(() => lift(body())),
	chain: (first, next) => Effect.flatMap(first as AnyEffect, (value) => lift(next(value))),
	// In the query's own fiber, as effect/sql runs its per-statement span and transformer: no fiber per query. The
	// logger can't fail (`Effect<void, never>`), and one that is slow delays its query.
	detach: (work) => Effect.suspend(work as () => AnyEffect),
	attempt: (run, onError) => {
		let query: AnyEffect;
		try {
			query = run() as AnyEffect;
		} catch (e) {
			return Effect.fail(onError(e));
		}
		return Effect.catch(query, (e) => Effect.fail(onError(e)));
	},
	queryError: (query, params, cause) =>
		new EffectDrizzleQueryError({ query, params: params as any[] | undefined, cause: Cause.fail(cause) }),
};

export const tracedEffectQueryRuntime: QueryRuntime = {
	...effectQueryRuntime,
	span: hasTelemetry ? tracedSpan : undefined,
};

export const runEffectProgram = <A, E = unknown, R = never>(body: () => QueryProgram<A>): Effect.Effect<A, E, R> =>
	runProgram(effectQueryRuntime, body) as Effect.Effect<A, E, R>;

export interface EffectMigrationSession {
	execute(query: SQL): AnyEffect;
	objects(query: SQL): AnyEffect;
	transaction(transaction: (tx: { execute(query: SQL): AnyEffect }) => AnyEffect): AnyEffect;
}

export const effectMigrationRunner = (session: EffectMigrationSession): MigrationRunner => ({
	execute: (query) => session.execute(query),
	objects: (query) => session.objects(query),
	atomically: (statements) =>
		session.transaction((tx) => Effect.forEach(statements, (statement) => tx.execute(statement), { discard: true })),
});
