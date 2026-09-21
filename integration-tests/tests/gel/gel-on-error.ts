import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DrizzleQueryError, sql } from 'drizzle-orm';
import type { GelJsDatabase } from 'drizzle-orm/gel';
import type { Mock } from 'vitest';

declare module 'vitest' {
	interface TestContext {
		onErrorGel: {
			db: GelJsDatabase;
			onError: Mock;
		};
	}
}

/**
 * Integration tests for the `onError` callback in DrizzleConfig (Gel).
 *
 * Setup required in the main test file (e.g. gel.test.ts):
 *
 *   import { tests as onErrorTests } from './gel-on-error';
 *
 *   const onErrorFn = vi.fn();
 *   let onErrorDb: GelJsDatabase;
 *
 *   beforeAll(async () => {
 *     onErrorDb = drizzle(client, { onError: onErrorFn });
 *   });
 *
 *   beforeEach((ctx) => {
 *     ctx.onErrorGel = { db: onErrorDb, onError: onErrorFn };
 *   });
 *
 *   onErrorTests();
 */
export function tests() {
	describe('onError callback', () => {
		beforeEach((ctx) => {
			ctx.onErrorGel.onError.mockClear();
		});

		test('onError is called when a query fails', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			await expect(
				db.execute(sql`select * from "nonexistent_table_on_error_test"`),
			).rejects.toThrow();

			expect(onError).toHaveBeenCalledOnce();
			expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
		});

		test('onError receives query, params, and cause', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			await expect(
				db.execute(sql`select * from "nonexistent_table_on_error_test"`),
			).rejects.toThrow();

			const error = onError.mock.calls[0]![0] as InstanceType<typeof DrizzleQueryError>;
			expect(error.query).toContain('nonexistent_table_on_error_test');
			expect(error.params).toBeDefined();
			expect(error.cause).toBeInstanceOf(Error);
		});

		test('if onError throws, that error propagates instead', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			// eslint-disable-next-line drizzle-internal/require-entity-kind
			class SanitizedError extends Error {
				constructor() {
					super('A database error occurred');
					this.name = 'SanitizedError';
				}
			}

			onError.mockImplementation(() => {
				throw new SanitizedError();
			});

			await expect(
				db.execute(sql`select * from "nonexistent_table_on_error_test"`),
			).rejects.toThrow(SanitizedError);
		});

		test('if onError returns void, the original DrizzleQueryError is thrown', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			onError.mockImplementation(() => {
				// just log, don't throw
			});

			await expect(
				db.execute(sql`select * from "nonexistent_table_on_error_test"`),
			).rejects.toThrow(DrizzleQueryError);
		});

		test('onError is not called when query succeeds', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			await db.execute(sql`select 1`);

			expect(onError).not.toHaveBeenCalled();
		});

		test('onError is called for INSERT failures', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			await expect(
				db.execute(sql`insert into "nonexistent_table_on_error_test" ("col") values ('val')`),
			).rejects.toThrow();

			expect(onError).toHaveBeenCalledOnce();
			expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
		});

		test('onError is called for errors within transactions', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			await expect(
				db.transaction(async (tx) => {
					await tx.execute(sql`select * from "nonexistent_table_on_error_test"`);
				}),
			).rejects.toThrow();

			expect(onError).toHaveBeenCalled();
			expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
		});

		test('onError can mutate the error before it is thrown', async (ctx) => {
			const { db, onError } = ctx.onErrorGel;

			onError.mockImplementation((err: InstanceType<typeof DrizzleQueryError>) => {
				Object.defineProperty(err, 'message', { value: 'sanitized' });
			});

			try {
				await db.execute(sql`select * from "nonexistent_table_on_error_test"`);
				expect.unreachable('should have thrown');
			} catch (e: any) {
				expect(e).toBeInstanceOf(DrizzleQueryError);
				expect(e.message).toBe('sanitized');
			}
		});
	});
}
