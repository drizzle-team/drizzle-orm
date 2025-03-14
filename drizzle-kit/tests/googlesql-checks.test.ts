import { sql } from 'drizzle-orm';
import { check, foreignKey, googlesqlTable, index, int64, string, uniqueIndex } from 'drizzle-orm/googlesql';
import { expect, test } from 'vitest';
import { diffTestSchemasGooglesql } from './schemaDiffer';

test('create table with check', async (t) => {
	// TODO: SPANNER - clean up this test to look like mysql-checks 'create table with check'
	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
			name: string('name', { length: 255 }),
			lastName: string('lastName', { length: 255 }),
			email: string('email', { length: 255 }),
		}, (table) => [
			check('users_age_check', sql`${table.age} > 13`),
			uniqueIndex('users_email_idx').on(table.email),
			index('users_lastName_name_idx').on(table.lastName, table.name),
		]),
	};

	const { sqlStatements, statements } = await diffTestSchemasGooglesql({}, to, []);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: false,
				type: 'int64',
			},
			{
				name: 'age',
				notNull: false,
				primaryKey: false,
				type: 'int64',
			},
			{
				name: 'name',
				notNull: false,
				primaryKey: false,
				type: 'string(255)',
			},
			{
				name: 'lastName',
				notNull: false,
				primaryKey: false,
				type: 'string(255)',
			},
			{
				name: 'email',
				notNull: false,
				primaryKey: false,
				type: 'string(255)',
			},
		],
		compositePKs: [
			'users_id;id',
		],
		checkConstraints: ['users_age_check;\`users\`.\`age\` > 13'],
		compositePkName: 'users_id',
		schema: undefined,
		internals: {
			tables: {},
			indexes: {},
		},
	});

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`CREATE TABLE \`users\` (
\t\`id\` int64 NOT NULL,
\t\`age\` int64,
\t\`name\` string(255),
\t\`lastName\` string(255),
\t\`email\` string(255),
\tCONSTRAINT \`users_age_check\` CHECK(\`users\`.\`age\` > 13)
) PRIMARY KEY(\`id\`);`);
	expect(sqlStatements[1]).toBe(`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`);
	expect(sqlStatements[2]).toBe(`CREATE INDEX \`users_lastName_name_idx\` ON \`users\` (\`lastName\`,\`name\`);`);
});

test('add check constraint to existing table', async (t) => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}),
	};

	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements, statements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_check_constraint',
		tableName: 'users',
		data: 'some_check_name;\`users\`.\`age\` > 21',
		schema: '',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name\` CHECK (\`users\`.\`age\` > 21);`,
	);
});

test('drop check constraint in existing table', async (t) => {
	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}),
	};

	const from = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements, statements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'delete_check_constraint',
		tableName: 'users',
		schema: '',
		constraintName: 'some_check_name',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
	);
});

test('rename check constraint', async (t) => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}, (table) => [
			check('new_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements, statements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		constraintName: 'some_check_name',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[1]).toStrictEqual({
		data: 'new_check_name;\`users\`.\`age\` > 21',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`users\` ADD CONSTRAINT \`new_check_name\` CHECK (\`users\`.\`age\` > 21);`,
	);
});

test('alter check constraint', async (t) => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
		}, (table) => [
			check('new_check_name', sql`${table.age} > 10`),
		]),
	};

	const { sqlStatements, statements } = await diffTestSchemasGooglesql(from, to, []);
	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		constraintName: 'some_check_name',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[1]).toStrictEqual({
		data: 'new_check_name;\`users\`.\`age\` > 10',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`users\` ADD CONSTRAINT \`new_check_name\` CHECK (\`users\`.\`age\` > 10);`,
	);
});

test('alter multiple check constraints', async (t) => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
			name: string('name', { length: 255 }),
		}, (table) => [
			check('some_check_name_1', sql`${table.age} > 21`),
			check('some_check_name_2', sql`${table.name} != 'Alex'`),
		]),
	};

	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
			name: string('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name_3', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_4', sql`${table.name} != 'Alex'`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasGooglesql(from, to, []);
	expect(statements.length).toBe(4);
	expect(statements[0]).toStrictEqual({
		constraintName: 'some_check_name_1',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[1]).toStrictEqual({
		constraintName: 'some_check_name_2',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[2]).toStrictEqual({
		data: 'some_check_name_3;\`users\`.\`age\` > 21',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});
	expect(statements[3]).toStrictEqual({
		data: "some_check_name_4;\`users\`.\`name\` != 'Alex'",
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name_1\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name_2\`;`,
	);
	expect(sqlStatements[2]).toBe(
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name_3\` CHECK (\`users\`.\`age\` > 21);`,
	);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name_4\` CHECK (\`users\`.\`name\` != \'Alex\');`,
	);
});

test('create checks with same names', async (t) => {
	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
			age: int64('age'),
			name: string('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name', sql`${table.name} != 'Alex'`),
		})),
	};

	await expect(diffTestSchemasGooglesql({}, to, [])).rejects.toThrowError();
});
