import { sql } from 'drizzle-orm';
import { comment, int, mssqlSchema, mssqlTable, text } from 'drizzle-orm/mssql-core';
import { diff as rawDiff } from 'src/dialects/dialect';
import { DB } from 'src/utils';
import { diff, diffIntrospect, drizzleToDDL, prepareTestDatabase, push, TestDatabase } from 'tests/mssql/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

// 1. CREATE TABLE with table comment and column comment

test('create table: with table and column comments', async () => {
	const schema = {
		users: mssqlTable(
			'users',
			{
				id: int('id').comment('Primary identifier'),
				email: text('email').comment('User email address'),
			},
			(table) => [
				comment('Users table'),
			],
		),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int,\n\t[email] text\n);\n`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Users table', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users';`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary identifier', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'User email address', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'email';`,
	]);
});

// 2. CREATE TABLE with column comment only

test('create table: with column comment only', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').comment('Primary identifier'),
		}),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int\n);\n`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary identifier', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 3. ADD COLUMN with comment

test('add column: with comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			email: text('email').comment('User email address'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] ADD [email] text;`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'User email address', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'email';`,
	]);
});

// 4. ALTER COLUMN comment: add comment to existing column

test('alter column: add comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').comment('Primary identifier'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary identifier', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 5. ALTER COLUMN comment: remove comment from existing column

test('alter column: remove comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').comment('Primary identifier'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_dropextendedproperty @name = N'MS_Description', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 6. ALTER TABLE comment: add comment to existing table

test('alter table: add comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable(
			'users',
			{
				id: int('id'),
			},
			(table) => [comment('Users table')],
		),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Users table', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users';`,
	]);
});

// 7. ALTER TABLE comment: remove comment from existing table

test('alter table: remove comment', async () => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id'),
			},
			(table) => [comment('Users table')],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_dropextendedproperty @name = N'MS_Description', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users';`,
	]);
});

// 8. diff should not include comment in alter_column

test('diff: comment should not be part of alter_column', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').notNull().comment('Primary identifier'),
		}),
	};

	const { statements } = await diff(schema1, schema2, []);

	const alterColumnStatements = statements.filter((it) => it.type === 'alter_column');
	expect(alterColumnStatements.length).toBe(1);
	// verify no comment in alter_column
	expect((alterColumnStatements[0] as any).diff.comment).toBeUndefined();

	const commentStatements = statements.filter((it) => it.type === 'comment_on_column');
	expect(commentStatements.length).toBe(1);
});

// 9. push idempotency with comments

test('push: idempotency with comments', async () => {
	const schema = {
		users: mssqlTable(
			'users',
			{
				id: int('id').comment('Primary identifier'),
				email: text('email').comment('User email address'),
			},
			(table) => [
				comment('Users table'),
			],
		),
	};

	const { sqlStatements: st1 } = await push({ db, to: schema, schemas: ['dbo'] });
	expect(st1.length).toBeGreaterThan(0);

	const { sqlStatements: st2 } = await push({ db, to: schema, schemas: ['dbo'] });
	expect(st2.length).toBe(0);
});

// 10. escape single quotes in comment

test('create table: escape single quotes in comment', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').comment("User's identifier"),
		}),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int\n);\n`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'User''s identifier', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 11. alter column comment: change comment text

test('alter column: change comment text', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').comment('Old comment'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').comment('New comment'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'New comment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 12. alter table comment: change comment text

test('alter table: change comment text', async () => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id'),
			},
			(table) => [comment('Old table comment')],
		),
	};

	const schema2 = {
		users: mssqlTable(
			'users',
			{
				id: int('id'),
			},
			(table) => [comment('New table comment')],
		),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'New table comment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users';`,
	]);
});

// 13. recreate column with comment should preserve comment

test('recreate column: preserves comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').comment('Primary identifier'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').generatedAlwaysAs(sql`1 + 1`).comment('Primary identifier'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP COLUMN [id];`,
		`ALTER TABLE [users] ADD [id] AS (1 + 1);`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary identifier', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 14. recreate identity column with comment should not duplicate comment

test('recreate identity column: preserves comment without duplicate', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').identity({ seed: 1, increment: 1 }).comment('Primary identifier'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity({ seed: 2, increment: 2 }).comment('Primary identifier'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	const commentStatements = sqlStatements.filter(
		(it) => it.includes('sp_addextendedproperty') || it.includes('sp_updateextendedproperty'),
	);
	expect(commentStatements).toStrictEqual([
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary identifier', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 15. empty string comment should be preserved

test('create table: empty string comment', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').comment(''),
		}),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int\n);\n`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 16. non-dbo schema comment

test('create table: comment on non-dbo schema', async () => {
	const mySchema = mssqlSchema('custom');
	const schema = {
		mySchema,
		users: mySchema.table(
			'users',
			{
				id: int('id').comment('Primary identifier'),
			},
			(table) => [comment('Users table')],
		),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE SCHEMA [custom];\n`,
		`CREATE TABLE [custom].[users] (\n\t[id] int\n);\n`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Users table', @level0type = N'SCHEMA', @level0name = N'custom', @level1type = N'TABLE', @level1name = N'users';`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary identifier', @level0type = N'SCHEMA', @level0name = N'custom', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 17. introspection round-trip with comments

test('introspect: round-trip with comments', async () => {
	const schema = {
		users: mssqlTable(
			'users',
			{
				id: int('id').comment('Primary identifier'),
				email: text('email').comment('User email address'),
			},
			(table) => [
				comment('Users table'),
			],
		),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'comment-round-trip');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// 18. alter column: change comment to empty string

test('alter column: change comment to empty string', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').comment('Old comment'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').comment(''),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 19. escape special characters in comment

test('create table: escape special characters in comment', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').comment('Line1\nLine2\tTab"Quote'),
		}),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int\n);\n`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Line1\nLine2\tTab"Quote', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 20. introspection: table without comment, column with comment (regression for missing import)

test('introspect: table without comment, column with comment', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').comment('Primary identifier'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-table-no-comment-column-with-comment',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// 21. recreate column with changed comment

test('recreate column: changed comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').comment('Old comment'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').generatedAlwaysAs(sql`1 + 1`).comment('New comment'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP COLUMN [id];`,
		`ALTER TABLE [users] ADD [id] AS (1 + 1);`,
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'New comment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 22. empty string comment → null

test('alter column: empty string comment to null', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').comment(''),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_dropextendedproperty @name = N'MS_Description', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});

// 23. recreate identity column with changed comment

test('recreate identity column: changed comment', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').identity({ seed: 1, increment: 1 }).comment('Old comment'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity({ seed: 2, increment: 2 }).comment('New comment'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	const commentStatements = sqlStatements.filter(
		(it) => it.includes('sp_addextendedproperty') || it.includes('sp_updateextendedproperty'),
	);
	expect(commentStatements).toStrictEqual([
		`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'New comment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'users', @level2type = N'COLUMN', @level2name = N'id';`,
	]);
});
