import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import {
	DrizzleCheckConstraintError,
	DrizzleForeignKeyConstraintError,
	DrizzleNotNullConstraintError,
	DrizzleUniqueConstraintError,
	isDrizzleConstraintError,
} from 'drizzle-orm/errors';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, expect, test } from 'vitest';

const ENABLE_LOGGING = false;

let db: BetterSQLite3Database<Record<string, never>>;
let client: Database.Database;

const usersTable = sqliteTable('constraint_users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	age: integer('age').notNull(),
}, (t) => [
	check('constraint_users_age_positive', sql`${t.age} >= 0`),
]);

const postsTable = sqliteTable('constraint_posts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
});

const commentsTable = sqliteTable('constraint_comments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	body: text('body').notNull(),
	postId: integer('post_id').notNull().references(() => postsTable.id),
});

beforeAll(async () => {
	client = new Database(':memory:');
	client.pragma('foreign_keys = ON');
	db = drizzle(client, { logger: ENABLE_LOGGING });

	await client.exec(`
		CREATE TABLE constraint_posts (id INTEGER PRIMARY KEY AUTOINCREMENT);
		CREATE TABLE constraint_users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			age INTEGER NOT NULL CHECK (age >= 0)
		);
		CREATE TABLE constraint_comments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			body TEXT NOT NULL,
			post_id INTEGER NOT NULL REFERENCES constraint_posts (id)
		);
		INSERT INTO constraint_posts (id) VALUES (1);
	`);
});

afterAll(async () => {
	client?.close();
});

test('unique constraint violation is mapped as the error cause', async () => {
	await db.insert(usersTable).values({ email: 'jan@example.com', name: 'Jan', age: 42 });

	try {
		await db.insert(usersTable).values({ email: 'jan@example.com', name: 'Copy', age: 42 });
		expect.unreachable('expected a unique constraint violation');
	} catch (e) {
		const cause = (e as { cause?: unknown }).cause;
		expect(isDrizzleConstraintError(cause)).toBe(true);
		expect(cause).instanceOf(DrizzleUniqueConstraintError);
		const mapped = cause as DrizzleUniqueConstraintError;
		expect(mapped.table).toBe('constraint_users');
		expect(mapped.column).toBe('email');
		expect((e as Error).message).toContain('Failed query');
	}
});

test('not null constraint violation is mapped as the error cause', async () => {
	try {
		await db.insert(usersTable).values({
			// @ts-expect-error `name` is NOT NULL
			name: null,
			email: 'null-name@example.com',
			age: 30,
		});
		expect.unreachable('expected a not null constraint violation');
	} catch (e) {
		expect((e as { cause?: unknown }).cause).instanceOf(DrizzleNotNullConstraintError);
	}
});

test('foreign key constraint violation is mapped as the error cause', async () => {
	await db.insert(commentsTable).values({ body: 'hello', postId: 1 });

	try {
		await db.insert(commentsTable).values({ body: 'orphan', postId: 9999 });
		expect.unreachable('expected a foreign key constraint violation');
	} catch (e) {
		expect((e as { cause?: unknown }).cause).instanceOf(DrizzleForeignKeyConstraintError);
	}
});

test('check constraint violation is mapped as the error cause', async () => {
	try {
		await db.insert(usersTable).values({
			email: 'check@example.com',
			name: 'Wrong Age',
			age: -5,
		});
		expect.unreachable('expected a check constraint violation');
	} catch (e) {
		expect((e as { cause?: unknown }).cause).instanceOf(DrizzleCheckConstraintError);
	}
});

test('errors still carry the failing query via DrizzleQueryError', async () => {
	const findConstraint = (error: unknown): unknown => {
		let current = error;
		while (current instanceof Error) {
			if (isDrizzleConstraintError(current)) return current;
			current = (current as { cause?: unknown }).cause;
		}
		return undefined;
	};

	try {
		db.run(sql`INSERT INTO constraint_users (email, name, age) VALUES ('raw@example.com', 'Raw', -1)`);
		expect.unreachable('expected a check constraint violation');
	} catch (e) {
		expect((e as Error).message).toContain('INSERT INTO constraint_users');
		expect(isDrizzleConstraintError(findConstraint(e))).toBe(true);
	}
});
