import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import {
	DrizzleCheckConstraintError,
	DrizzleForeignKeyConstraintError,
	DrizzleNotNullConstraintError,
	DrizzleUniqueConstraintError,
	isDrizzleConstraintError,
} from 'drizzle-orm/errors';
import { check, int, mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDockerDB } from './mysql-common';

const ENABLE_LOGGING = false;

let db: MySql2Database;
let client: mysql.Connection;

const usersTable = mysqlTable('constraint_users', {
	id: serial('id').primaryKey(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	name: varchar('name', { length: 255 }).notNull(),
	age: int('age').notNull(),
}, (t) => [
	check('constraint_users_age_positive', sql`${t.age} >= 0`),
]);

const postsTable = mysqlTable('constraint_posts', {
	id: int('id').autoincrement().primaryKey(),
});

const commentsTable = mysqlTable('constraint_comments', {
	id: serial('id').primaryKey(),
	body: varchar('body', { length: 255 }).notNull(),
	postId: int('post_id').notNull().references(() => postsTable.id),
});

beforeAll(async () => {
	let connectionString;
	if (process.env['MYSQL_CONNECTION_STRING']) {
		connectionString = process.env['MYSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		const client = await mysql.createConnection({
			uri: connectionString!,
			supportBigNumbers: true,
		});
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
		'CREATE TABLE constraint_posts (id int AUTO_INCREMENT PRIMARY KEY)',
	);
	await client.query(
		`CREATE TABLE constraint_users (
			id serial PRIMARY KEY,
			email varchar(255) NOT NULL UNIQUE,
			name varchar(255) NOT NULL,
			age int NOT NULL,
			CONSTRAINT constraint_users_age_positive CHECK (age >= 0)
		)`,
	);
	await client.query(
		`CREATE TABLE constraint_comments (
			id serial PRIMARY KEY,
			body text NOT NULL,
			post_id int NOT NULL,
			CONSTRAINT constraint_comments_post_id FOREIGN KEY (post_id) REFERENCES constraint_posts (id)
		)`,
	);
	await client.query('INSERT INTO constraint_posts (id) VALUES (1)');
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
		expect(mapped.code).toBe(1062);
		expect(mapped.table).toBe('constraint_users');
		expect(mapped.constraint).toBeTruthy();
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
		await db.insert(usersTable).values({ email: 'check@example.com', name: 'Wrong Age', age: -5 });
		expect.unreachable('expected a check constraint violation');
	} catch (e) {
		expect((e as { cause?: unknown }).cause).instanceOf(DrizzleCheckConstraintError);
	}
});

test('errors still carry the failing query via DrizzleQueryError', async () => {
	try {
		await db.execute(
			sql`INSERT INTO constraint_users (email, name, age) VALUES ('raw@example.com', 'Raw', -1)`,
		);
		expect.unreachable('expected a check constraint violation');
	} catch (e) {
		expect((e as Error).message).toContain('INSERT INTO constraint_users');
		expect(isDrizzleConstraintError((e as { cause?: unknown }).cause)).toBe(true);
	}
});
