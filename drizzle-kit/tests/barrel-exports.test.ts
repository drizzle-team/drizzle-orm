import fs from 'fs';
import path from 'path';
import { integer, pgEnum, pgSchema, pgSequence, pgTable, serial, text, unique } from 'drizzle-orm/pg-core';
import { MySqlTable, mysqlTable, serial as mysqlSerial, varchar } from 'drizzle-orm/mysql-core';
import { sqliteTable, text as sqliteText, integer as sqliteInt } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import {
	prepareFromExports as pgPrepareFromExports,
	prepareFromPgImports,
} from 'src/serializer/pgImports';
import {
	prepareFromExports as mysqlPrepareFromExports,
	prepareFromMySqlImports,
} from 'src/serializer/mysqlImports';
import {
	prepareFromExports as sqlitePrepareFromExports,
	prepareFromSqliteImports,
} from 'src/serializer/sqliteImports';

test('pg: barrel re-exports should not cause duplicate tables', () => {
	const status = pgEnum('status', ['active', 'inactive']);
	const mySchema = pgSchema('myschema');
	const seq = pgSequence('my_seq');

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		status: status('status'),
	});

	const deals = pgTable(
		'deals',
		{
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			userId: text('user_id').notNull(),
		},
		(table) => [unique().on(table.name, table.userId)],
	);

	// Simulate individual files
	const authExports = { users, status, mySchema, seq };
	const dealsExports = { deals };

	// Simulate barrel file that re-exports all (same references)
	const barrelExports = { users, status, mySchema, seq, deals };

	// Collect from all three modules (auth.ts, deals.ts, index.ts)
	const allPrepared = [authExports, dealsExports, barrelExports].map(pgPrepareFromExports);

	const tables = allPrepared.flatMap((p) => p.tables);
	const enums = allPrepared.flatMap((p) => p.enums);
	const schemas = allPrepared.flatMap((p) => p.schemas);
	const sequences = allPrepared.flatMap((p) => p.sequences);

	// Before dedup: should have duplicates
	expect(tables.length).toBeGreaterThan(2);
	expect(enums.length).toBeGreaterThan(1);

	// After Set dedup: should be unique (same references)
	expect(Array.from(new Set(tables))).toHaveLength(2);
	expect(Array.from(new Set(enums))).toHaveLength(1);
	expect(Array.from(new Set(schemas))).toHaveLength(1);
	expect(Array.from(new Set(sequences))).toHaveLength(1);
});

test('mysql: barrel re-exports should not cause duplicate tables or views', () => {
	const users = mysqlTable('users', {
		id: mysqlSerial('id').primaryKey(),
		name: varchar('name', { length: 256 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: mysqlSerial('id').primaryKey(),
		title: varchar('title', { length: 256 }).notNull(),
	});

	const authExports = { users };
	const postsExports = { posts };
	const barrelExports = { users, posts };

	const allPrepared = [authExports, postsExports, barrelExports].map(mysqlPrepareFromExports);

	const tables = allPrepared.flatMap((p) => p.tables);
	const views = allPrepared.flatMap((p) => p.views);

	expect(tables.length).toBeGreaterThan(2);
	expect(Array.from(new Set(tables))).toHaveLength(2);
	expect(Array.from(new Set(views))).toHaveLength(0);
});

test('sqlite: barrel re-exports should not cause duplicate tables or views', () => {
	const users = sqliteTable('users', {
		id: sqliteInt('id').primaryKey(),
		name: sqliteText('name').notNull(),
	});

	const posts = sqliteTable('posts', {
		id: sqliteInt('id').primaryKey(),
		content: sqliteText('content'),
	});

	const authExports = { users };
	const postsExports = { posts };
	const barrelExports = { users, posts };

	const allPrepared = [authExports, postsExports, barrelExports].map(sqlitePrepareFromExports);

	const tables = allPrepared.flatMap((p) => p.tables);
	expect(tables.length).toBeGreaterThan(2);
	expect(Array.from(new Set(tables))).toHaveLength(2);
});

test('pg: prepareFromPgImports deduplicates with barrel exports', async () => {
	const tmpDir = path.join(__dirname, '.barrel-test-pg');
	fs.mkdirSync(tmpDir, { recursive: true });

	try {
		fs.writeFileSync(
			path.join(tmpDir, 'auth.ts'),
			`
import { pgTable, serial, text, pgEnum } from 'drizzle-orm/pg-core';

export const statusEnum = pgEnum('status', ['active', 'inactive']);

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	status: statusEnum('status'),
});
`,
		);

		fs.writeFileSync(
			path.join(tmpDir, 'deals.ts'),
			`
import { pgTable, serial, text, unique } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const deals = pgTable('deals', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => [unique().on(table.name, table.userId)]);
`,
		);

		fs.writeFileSync(
			path.join(tmpDir, 'index.ts'),
			`
export * from './auth';
export * from './deals';
`,
		);

		const filePaths = [
			path.join(tmpDir, 'auth.ts'),
			path.join(tmpDir, 'deals.ts'),
			path.join(tmpDir, 'index.ts'),
		];

		const result = await prepareFromPgImports(filePaths);

		// Should have exactly 2 tables, not 4
		expect(result.tables).toHaveLength(2);
		// Should have exactly 1 enum, not 2
		expect(result.enums).toHaveLength(1);

		const tableNames = result.tables.map((t) => {
			const config = (t as any)[Symbol.for('drizzle:Name')];
			return config;
		});
		expect(tableNames).toContain('users');
		expect(tableNames).toContain('deals');
	} finally {
		for (const key of Object.keys(require.cache)) {
			if (key.includes('.barrel-test-pg')) {
				delete require.cache[key];
			}
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test('mysql: prepareFromMySqlImports deduplicates with barrel exports', async () => {
	const tmpDir = path.join(__dirname, '.barrel-test-mysql');
	fs.mkdirSync(tmpDir, { recursive: true });

	try {
		fs.writeFileSync(
			path.join(tmpDir, 'users.ts'),
			`
import { mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 256 }).notNull(),
});
`,
		);

		fs.writeFileSync(
			path.join(tmpDir, 'posts.ts'),
			`
import { mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';

export const posts = mysqlTable('posts', {
	id: serial('id').primaryKey(),
	title: varchar('title', { length: 256 }).notNull(),
});
`,
		);

		fs.writeFileSync(
			path.join(tmpDir, 'index.ts'),
			`
export * from './users';
export * from './posts';
`,
		);

		const filePaths = [
			path.join(tmpDir, 'users.ts'),
			path.join(tmpDir, 'posts.ts'),
			path.join(tmpDir, 'index.ts'),
		];

		const result = await prepareFromMySqlImports(filePaths);

		expect(result.tables).toHaveLength(2);
		expect(result.views).toHaveLength(0);
	} finally {
		for (const key of Object.keys(require.cache)) {
			if (key.includes('.barrel-test-mysql')) {
				delete require.cache[key];
			}
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test('sqlite: prepareFromSqliteImports deduplicates with barrel exports', async () => {
	const tmpDir = path.join(__dirname, '.barrel-test-sqlite');
	fs.mkdirSync(tmpDir, { recursive: true });

	try {
		fs.writeFileSync(
			path.join(tmpDir, 'users.ts'),
			`
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});
`,
		);

		fs.writeFileSync(
			path.join(tmpDir, 'posts.ts'),
			`
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	content: text('content'),
});
`,
		);

		fs.writeFileSync(
			path.join(tmpDir, 'index.ts'),
			`
export * from './users';
export * from './posts';
`,
		);

		const filePaths = [
			path.join(tmpDir, 'users.ts'),
			path.join(tmpDir, 'posts.ts'),
			path.join(tmpDir, 'index.ts'),
		];

		const result = await prepareFromSqliteImports(filePaths);

		expect(result.tables).toHaveLength(2);
		expect(result.views).toHaveLength(0);
	} finally {
		for (const key of Object.keys(require.cache)) {
			if (key.includes('.barrel-test-sqlite')) {
				delete require.cache[key];
			}
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});
