import { sql } from 'drizzle-orm';
import { check, int, mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diffTestSchemasMysql } from './schemaDiffer';

test('create table with check', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasMysql({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		columns: [
			{
				name: 'id',
				type: 'serial',
				notNull: true,
				primaryKey: false,
				autoincrement: true,
			},
			{
				name: 'age',
				type: 'int',
				notNull: false,
				primaryKey: false,
				autoincrement: false,
			},
		],
		compositePKs: [
			'users_id;id',
		],
		checkConstraints: ['some_check_name;\`users\`.\`age\` > 21'],
		compositePkName: 'users_id',
		uniqueConstraints: [],
		schema: undefined,
		internals: {
			tables: {},
			indexes: {},
		},
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TABLE \`users\` (
\t\`id\` serial AUTO_INCREMENT NOT NULL,
\t\`age\` int,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
\tCONSTRAINT \`some_check_name\` CHECK(\`users\`.\`age\` > 21)
);\n`);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasMysql(from, to, []);

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

test('drop check contraint in existing table', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}),
	};

	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasMysql(from, to, []);

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
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('new_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasMysql(from, to, []);

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
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('new_check_name', sql`${table.age} > 10`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasMysql(from, to, []);
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
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name_1', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_2', sql`${table.name} != 'Alex'`),
		})),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name_3', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_4', sql`${table.name} != 'Alex'`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasMysql(from, to, []);
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
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name', sql`${table.name} != 'Alex'`),
		})),
	};

	await expect(diffTestSchemasMysql({}, to, [])).rejects.toThrowError();
});

test('rename column referenced by a check drops the check first', async (t) => {
	const from = {
		balances: mysqlTable('balances', {
			id: serial('id').primaryKey(),
			amount: int('amount').notNull(),
		}, (table) => ({
			checkConstraint: check('balances_amount_check', sql`${table.amount} >= 0`),
		})),
	};

	const to = {
		balances: mysqlTable('balances', {
			id: serial('id').primaryKey(),
			total: int('total').notNull(),
		}, (table) => ({
			checkConstraint: check('balances_total_check', sql`${table.total} >= 0`),
		})),
	};

	const { sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.balances.amount->public.balances.total',
	]);

	// MySQL rejects a rename while a check still references the column,
	// so the old check must be dropped before the rename runs.
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `balances` DROP CONSTRAINT `balances_amount_check`;',
		'ALTER TABLE `balances` RENAME COLUMN `amount` TO `total`;',
		'ALTER TABLE `balances` ADD CONSTRAINT `balances_total_check` CHECK (`balances`.`total` >= 0);',
	]);
});
