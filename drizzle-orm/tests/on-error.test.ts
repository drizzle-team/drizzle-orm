import { describe, expect, test, vi } from 'vitest';
import { DrizzleQueryError, sql } from '../src/index.ts';
import { drizzle as pgDrizzle } from '../src/node-postgres/driver.ts';
import { drizzle as mysqlDrizzle } from '../src/mysql2/driver.ts';
import { drizzle as singlestoreDrizzle } from '../src/singlestore/driver.ts';
import { drizzle as gelDrizzle } from '../src/gel/driver.ts';

describe('onError callback - pg', () => {
	test('onError is called when a query fails', async () => {
		const onError = vi.fn();
		const db = pgDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
	});

	test('onError receives query, params, and cause', async () => {
		const onError = vi.fn();
		const db = pgDrizzle.mock({ onError });

		await expect(db.execute(sql`select ${1}`)).rejects.toThrow();

		const err = onError.mock.calls[0]![0] as InstanceType<typeof DrizzleQueryError>;
		expect(err.query).toContain('select');
		expect(err.params).toBeDefined();
		expect(err.cause).toBeInstanceOf(Error);
	});

	test('if onError throws, that error propagates instead', async () => {
		const onError = vi.fn().mockImplementation(() => {
			throw new Error('sanitized');
		});
		const db = pgDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow('sanitized');
	});

	test('if onError returns void, original DrizzleQueryError is thrown', async () => {
		const onError = vi.fn();
		const db = pgDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow(DrizzleQueryError);
	});

	test('onError can mutate the error message', async () => {
		const onError = vi.fn().mockImplementation((err: InstanceType<typeof DrizzleQueryError>) => {
			Object.defineProperty(err, 'message', { value: 'sanitized' });
		});
		const db = pgDrizzle.mock({ onError });

		try {
			await db.execute(sql`select 1`);
			expect.unreachable('should have thrown');
		} catch (e: any) {
			expect(e).toBeInstanceOf(DrizzleQueryError);
			expect(e.message).toBe('sanitized');
		}
	});
});

describe('onError callback - mysql2', () => {
	test('onError is called when a query fails', async () => {
		const onError = vi.fn();
		const db = mysqlDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
	});

	test('if onError throws, that error propagates instead', async () => {
		const onError = vi.fn().mockImplementation(() => {
			throw new Error('sanitized');
		});
		const db = mysqlDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow('sanitized');
	});

	test('if onError returns void, original DrizzleQueryError is thrown', async () => {
		const onError = vi.fn();
		const db = mysqlDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow(DrizzleQueryError);
	});
});

describe('onError callback - singlestore', () => {
	test('onError is called when a query fails', async () => {
		const onError = vi.fn();
		const db = singlestoreDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
	});

	test('if onError throws, that error propagates instead', async () => {
		const onError = vi.fn().mockImplementation(() => {
			throw new Error('sanitized');
		});
		const db = singlestoreDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow('sanitized');
	});

	test('if onError returns void, original DrizzleQueryError is thrown', async () => {
		const onError = vi.fn();
		const db = singlestoreDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow(DrizzleQueryError);
	});
});

describe('onError callback - gel', () => {
	test('onError is called when a query fails', async () => {
		const onError = vi.fn();
		const db = gelDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0]![0]).toBeInstanceOf(DrizzleQueryError);
	});

	test('if onError throws, that error propagates instead', async () => {
		const onError = vi.fn().mockImplementation(() => {
			throw new Error('sanitized');
		});
		const db = gelDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow('sanitized');
	});

	test('if onError returns void, original DrizzleQueryError is thrown', async () => {
		const onError = vi.fn();
		const db = gelDrizzle.mock({ onError });

		await expect(db.execute(sql`select 1`)).rejects.toThrow(DrizzleQueryError);
	});
});
