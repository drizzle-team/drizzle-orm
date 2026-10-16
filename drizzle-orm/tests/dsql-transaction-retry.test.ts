import { expect, test } from 'vitest';
import { dsqlTable, integer, text } from '~/dsql-core/index.ts';
import { drizzle, DSQLRetryExhaustedError } from '~/dsql/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';

const users = dsqlTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

// Aurora DSQL reports optimistic concurrency conflicts as SQLSTATE 40001
const occError = () => Object.assign(new Error('change conflicts with another transaction (OC000)'), { code: '40001' });

// Logs every statement and fails the first `times` statements matching `failOn`
function fakeClient(failOn: (statement: string) => boolean, error: () => Error = occError, times = 1) {
	const statements: string[] = [];
	let failures = 0;
	const client = {
		async query(query: string | { text: string }) {
			const statement = typeof query === 'string' ? query : query.text;
			statements.push(statement);
			if (failures < times && failOn(statement)) {
				failures++;
				throw error();
			}
			return { rows: [], rowCount: 0, command: statement.split(' ')[0]!, fields: [] };
		},
	};
	return { client, statements };
}

const retryConfig = { baseDelayMs: 1, maxDelayMs: 1 };

test('transaction is retried when a statement conflicts', async () => {
	const { client, statements } = fakeClient((it) => it.startsWith('update'));
	const db = drizzle(client as any, { retryConfig });

	let attempts = 0;
	await db.transaction(async (tx) => {
		attempts++;
		await tx.update(users).set({ name: 'TxUser' }).where(eq(users.id, 1));
	});

	expect(attempts).toBe(2);
	expect(statements.map((it) => it.split(' ')[0])).toStrictEqual([
		'BEGIN',
		'update',
		'ROLLBACK',
		'BEGIN',
		'update',
		'COMMIT',
	]);
});

test('transaction is retried when commit conflicts', async () => {
	const { client, statements } = fakeClient((it) => it === 'COMMIT');
	const db = drizzle(client as any, { retryConfig });

	let attempts = 0;
	await db.transaction(async (tx) => {
		attempts++;
		await tx.update(users).set({ name: 'TxUser' }).where(eq(users.id, 1));
	});

	// A failed COMMIT has already rolled the transaction back, so it can't be retried on its own
	expect(attempts).toBe(2);
	expect(statements.map((it) => it.split(' ')[0])).toStrictEqual([
		'BEGIN',
		'update',
		'COMMIT',
		'ROLLBACK',
		'BEGIN',
		'update',
		'COMMIT',
	]);
});

test('transaction is not retried for other errors', async () => {
	const { client, statements } = fakeClient(
		(it) => it.startsWith('update'),
		() => Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
	);
	const db = drizzle(client as any, { retryConfig });

	let attempts = 0;
	await expect(db.transaction(async (tx) => {
		attempts++;
		await tx.update(users).set({ name: 'TxUser' }).where(eq(users.id, 1));
	})).rejects.toThrow();

	expect(attempts).toBe(1);
	expect(statements.map((it) => it.split(' ')[0])).toStrictEqual(['BEGIN', 'update', 'ROLLBACK']);
});

test('transaction is not retried when a nested query runs out of retries', async () => {
	const { client, statements } = fakeClient((it) => it === 'select 1', occError, Infinity);
	const db = drizzle(client as any, { retryConfig: { ...retryConfig, maxRetries: 2 } });

	let attempts = 0;
	await expect(db.transaction(async () => {
		attempts++;
		await db.execute(sql`select 1`);
	})).rejects.toThrow(DSQLRetryExhaustedError);

	// The query already retried on its own, so the transaction doesn't multiply its retries
	expect(attempts).toBe(1);
	expect(statements).toStrictEqual(['BEGIN', 'select 1', 'select 1', 'select 1', 'ROLLBACK']);
});

test('transaction is not retried when a nested query builder runs out of retries', async () => {
	const { client, statements } = fakeClient((it) => it.startsWith('update'), occError, Infinity);
	const db = drizzle(client as any, { retryConfig: { ...retryConfig, maxRetries: 2 } });

	let attempts = 0;
	const error = await db.transaction(async () => {
		attempts++;
		await db.update(users).set({ name: 'OtherUser' }).where(eq(users.id, 1));
	}).catch((e) => e);

	// Query builders wrap the exhausted retries in DrizzleQueryError
	expect(error.cause).toBeInstanceOf(DSQLRetryExhaustedError);
	expect(attempts).toBe(1);
	expect(statements.map((it) => it.split(' ')[0])).toStrictEqual(['BEGIN', 'update', 'update', 'update', 'ROLLBACK']);
});
