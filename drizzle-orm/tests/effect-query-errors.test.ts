import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { describe, test } from 'vitest';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import { EffectLogger } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { MySqlEffectPreparedQuery } from '~/mysql-core/effect/session.ts';
import type { MySqlPreparedQueryConfig } from '~/mysql-core/session.ts';
import { PgEffectPreparedQuery } from '~/pg-core/effect/session.ts';
import type { PreparedQueryConfig as PgPreparedQueryConfig } from '~/pg-core/session.ts';
import { SQLiteEffectPreparedQuery } from '~/sqlite-core/effect/session.ts';
import type { PreparedQueryConfig as SQLitePreparedQueryConfig } from '~/sqlite-core/session.ts';

interface TestQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

describe.each(['PostgreSQL', 'MySQL', 'SQLite'])('%s Effect query errors', (dialect) => {
	const query = { sql: dialect === 'PostgreSQL' ? 'select $1' : 'select ?', params: [1] };
	const logger = Effect.runSync(EffectLogger.make);
	const cache = Effect.runSync(EffectCache.make);

	const execute = (effect: Effect.Effect<unknown, unknown>) => {
		const executor = () => effect;
		const args = [query, undefined, 'raw', logger, cache, undefined, undefined] as const;
		if (dialect === 'PostgreSQL') {
			return new PgEffectPreparedQuery<PgPreparedQueryConfig, TestQueryEffectHKT>(executor, ...args).execute();
		}
		if (dialect === 'MySQL') {
			return new MySqlEffectPreparedQuery<MySqlPreparedQueryConfig, TestQueryEffectHKT>(executor, ...args).execute();
		}
		return new SQLiteEffectPreparedQuery<SQLitePreparedQueryConfig, TestQueryEffectHKT>(
			'all',
			{ all: executor, get: executor, run: executor, values: executor },
			...args,
		).execute();
	};

	test('preserves a defect alongside a wrapped query failure', async ({ expect }) => {
		const error = new Error('query failed');
		const defect = new Error('concurrent driver defect');
		const cause = Cause.combine(Cause.fail(error), Cause.die(defect));
		const exit = await Effect.runPromiseExit(execute(Effect.failCause(cause)));

		expect(Exit.isFailure(exit)).toBe(true);
		if (!Exit.isFailure(exit)) return;
		expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(['Fail', 'Die']);
		expect(exit.cause.reasons).toMatchObject([
			{
				_tag: 'Fail',
				error: { _tag: 'EffectDrizzleQueryError', query: query.sql, params: query.params, cause: Cause.fail(error) },
			},
			{ _tag: 'Die', defect },
		]);
	});

	test('wraps every typed failure without discarding interruption', async ({ expect }) => {
		const errors = [new Error('first query failed'), new Error('second query failed')];
		const interruption = Cause.interrupt(123);
		const cause = Cause.combine(Cause.combine(Cause.fail(errors[0]), Cause.fail(errors[1])), interruption);
		const exit = await Effect.runPromiseExit(execute(Effect.failCause(cause)));

		expect(Exit.isFailure(exit)).toBe(true);
		if (!Exit.isFailure(exit)) return;
		expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(['Fail', 'Fail', 'Interrupt']);
		expect(exit.cause.reasons).toMatchObject([
			...errors.map((error) => ({
				_tag: 'Fail',
				error: { _tag: 'EffectDrizzleQueryError', query: query.sql, params: query.params, cause: Cause.fail(error) },
			})),
			...interruption.reasons,
		]);
	});

	test('leaves successful results and causes without typed failures unchanged', async ({ expect }) => {
		const rows = [{ value: 1 }];
		expect(await Effect.runPromise(execute(Effect.succeed(rows)))).toBe(rows);

		const cause = Cause.combine(Cause.die(new Error('driver defect')), Cause.interrupt(123));
		expect(await Effect.runPromiseExit(execute(Effect.failCause(cause)))).toEqual(Exit.failCause(cause));
	});
});
