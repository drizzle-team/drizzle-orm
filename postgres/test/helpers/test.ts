// bun:test's `test` with a database context, as vitest's `test.extend` fixtures give:
//
//   test('reads a row', async ({ c }) => { … });        // c: a fresh connection
//   test('shares a pool', async ({ pool }) => { … });   // pool: a fresh pool
//
// Only what the callback's parameter names is opened, and it is ended when the test finishes, pass or fail. bun:test
// has no `extend`, so the names are read from the callback's source, the way vitest reads its fixtures.
import { test as bunTest } from 'bun:test';
import type { Pool } from '../../src/index.ts';
import { testConnect, testPool } from './db.ts';

export interface DbContext {
	/** A fresh connection (helpers/db.ts testConnect) */
	c: Awaited<ReturnType<typeof testConnect>>;
	/** A fresh pool (helpers/db.ts testPool) */
	pool: Pool;
}
type DbTestFn = (context: DbContext) => unknown;

// The names in the callback's first parameter when it is a destructuring pattern: `async ({ c, pool }) => …`
const usedNames = (fn: DbTestFn): string[] => {
	const pattern = /^[^(]*\(\s*\{([^}]*)\}/.exec(fn.toString())?.[1];
	return pattern === undefined ? [] : pattern.split(',').map((part) => part.split(':')[0]!.trim());
};

const withContext = (fn: DbTestFn) => {
	const names = usedNames(fn);
	return async () => {
		const context: Partial<DbContext> = {};
		try {
			if (names.includes('c')) context.c = await testConnect();
			if (names.includes('pool')) context.pool = testPool();
			await fn(context as DbContext);
		} finally {
			await context.c?.end().catch(() => {});
			await context.pool?.end().catch(() => {});
		}
	};
};

type DbTest = (name: string, fn: DbTestFn, timeout?: number) => void;

export const test: DbTest & { skipIf(condition: boolean): DbTest; todo: typeof bunTest.todo } = Object.assign(
	((name, fn, timeout) => bunTest(name, withContext(fn), timeout)) as DbTest,
	{
		skipIf: (condition: boolean): DbTest => (name, fn, timeout) =>
			bunTest.skipIf(condition)(name, withContext(fn), timeout),
		todo: bunTest.todo,
	},
);
