import { DrizzleQueryError } from '~/errors.ts';
import type { SQL } from '~/sql/sql.ts';
import { hasTelemetry } from '~/tracing.ts';
import type { MigrationRunner } from '~/up-migrations/utils.ts';
import { type QueryProgram, type QueryRuntime, runProgram, tracedSpan } from './core.ts';

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	value !== null && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function';

export const asyncQueryRuntime: QueryRuntime = {
	suspend(body) {
		try {
			return body();
		} catch (e) {
			return Promise.reject(e);
		}
	},
	chain: (first, next) => isThenable(first) ? first.then(next) : next(first),
	detach: (work) => {
		work();
	},
	attempt(run, onError) {
		let query: Promise<unknown>;
		try {
			query = run() as Promise<unknown>;
		} catch (e) {
			return Promise.reject(onError(e));
		}
		return query.then(undefined, (e) => {
			throw onError(e);
		});
	},
	queryError: (query, params, cause) => new DrizzleQueryError(query, params, cause as Error),
};

export const tracedAsyncQueryRuntime: QueryRuntime = {
	...asyncQueryRuntime,
	span: hasTelemetry ? tracedSpan : undefined,
};

export const runAsyncProgram = <A>(body: () => QueryProgram<A>): Promise<A> =>
	Promise.resolve(runProgram(asyncQueryRuntime, body) as A | Promise<A>);

export interface AsyncMigrationSession {
	execute(query: SQL): unknown;
	objects(query: SQL): unknown;
	transaction(transaction: (tx: { execute(query: SQL): unknown }) => Promise<void>): Promise<unknown>;
}

export function asyncMigrationRunner(
	session: AsyncMigrationSession,
	atomically?: MigrationRunner['atomically'],
): MigrationRunner {
	return {
		execute: (query) => session.execute(query),
		objects: (query) => session.objects(query),
		atomically: atomically ?? (async (statements) => {
			await session.transaction(async (tx) => {
				for (const statement of statements) await tx.execute(statement);
			});
		}),
	};
}
