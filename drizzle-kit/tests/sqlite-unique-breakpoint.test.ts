import { int, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { BREAKPOINT } from '../src/cli/commands/migrate';
import { diffTestSchemasSqlite } from './schemaDiffer';

test('unique constraint with breakpoints', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			email: text('email').notNull(),
			name: text('name'),
		}, (t) => ({
			emailUnique: unique('email_unique').on(t.email),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`email` text NOT NULL,\n\t`name` text\n);\n',
		'CREATE UNIQUE INDEX `email_unique` ON `users` (`email`);',
	]);
});

test('multiple unique constraints with breakpoints', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			email: text('email').notNull(),
			username: text('username').notNull(),
			name: text('name'),
		}, (t) => ({
			emailUnique: unique('email_unique').on(t.email),
			usernameUnique: unique('username_unique').on(t.username),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`email` text NOT NULL,\n\t`username` text NOT NULL,\n\t`name` text\n);\n',
		'CREATE UNIQUE INDEX `email_unique` ON `users` (`email`);',
		'CREATE UNIQUE INDEX `username_unique` ON `users` (`username`);',
	]);
});

test('unique constraints in migration scenario', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			email: text('email').notNull(),
		}),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			email: text('email').notNull(),
			username: text('username').notNull(),
		}, (t) => ({
			emailUnique: unique('email_unique').on(t.email),
			usernameUnique: unique('username_unique').on(t.username),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements.length).toBeGreaterThan(0);

	const sqlWithBreakpoints = sqlStatements.join(`\n${BREAKPOINT}`);

	const breakpointCount = (sqlWithBreakpoints.match(/--> statement-breakpoint/g) || []).length;
	expect(breakpointCount).toBe(Math.max(0, sqlStatements.length - 1));

	sqlStatements.forEach((statement) => {
		expect(statement).not.toMatch(/^--> statement-breakpoint/);
		expect(statement).not.toMatch(/--> statement-breakpoint$/);
	});
});
