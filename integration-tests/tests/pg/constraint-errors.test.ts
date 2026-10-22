import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import {
	DrizzleCheckConstraintError,
	DrizzleForeignKeyConstraintError,
	DrizzleNotNullConstraintError,
	DrizzleUniqueConstraintError,
	isDrizzleConstraintError,
} from 'drizzle-orm/errors';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { check, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDockerDB } from './pg-common';

const ENABLE_LOGGING = false;

let db: NodePgDatabase;
let client: Client;

const usersTable = pgTable('constraint_users', {
	id: serial('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	age: integer('age').notNull(),
}, (t) => [
	check('constraint_users_age_positive', sql`${t.age} >= 0`),
]);

const postsTable = pgTable('constraint_posts', {
	id: serial('id').primaryKey(),
});

const commentsTable = pgTable('constraint_comments', {
	id: serial('id').primaryKey(),
	body: text('body').notNull(),
	postId: integer('post_id').notNull().references(() => postsTable.id),
});

beforeAll(async () => {
	let connectionString;
	if (process.env['PG_CONNECTION_STRING']) {
		connectionString = process.env['PG_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		const client = new Client(connectionString!);
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});
	db = drizzle(client, { logger: ENABLE_LOGGING });

	await client.query(
		`CREATE TABLE constraint_posts (id serial PRIMARY KEY);
		CREATE TABLE constraint_users (
			id serial PRIMARY KEY,
			email text NOT NULL UNIQUE,
			name text NOT NULL,
			age integer NOT NULL,
			CONSTRAINT constraint_users_age_positive CHECK (age >= 0)
		);
		CREATE TABLE constraint_comments (
			id serial PRIMARY KEY,
			body text NOT NULL,
			post_id integer NOT NULL REFERENCES constraint_posts (id)
		);
		INSERT INTO constraint_posts (id) VALUES (1);`,
	);
});

afterAll(async () => {
	await client?.end();
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
		expect(mapped.code).toBe('23505');
		expect(mapped.table).toBe('constraint_users');
		expect(mapped.column).toBe('email');
		expect(mapped.constraint).toBeTruthy();
		expect((mapped as { detail?: string }).detail).toContain('Key (email)=');
	}
});

test('not null constraint violation is mapped as the error cause', async () => {
	try {
		await drizzle(client, { logger: ENABLE_LOGGING }).insert(usersTable).values({
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
		await db.insert(usersTable).values({ email: 'check@example.com', name: 'Wrong Age', age: -5 });
		expect.unreachable('expected a check constraint violation');
	} catch (e) {
		expect((e as { cause?: unknown }).cause).instanceOf(DrizzleCheckConstraintError);
	}
});

test('errors still carry the failing query via DrizzleQueryError', async () => {
	try {
		await db.run(sql`INSERT INTO constraint_users (email, name, age) VALUES ('raw@example.com', 'Raw', -1)`);
		expect.unreachable('expected a check constraint violation');
	} catch (e) {
		expect((e as Error).message).toContain('INSERT INTO constraint_users');
		expect(isDrizzleConstraintError((e as { cause?: unknown }).cause)).toBe(true);
	}
});
