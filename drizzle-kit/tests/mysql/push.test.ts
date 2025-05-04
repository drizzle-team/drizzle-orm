import { sql } from 'drizzle-orm';
import { check, int, mysqlTable, mysqlView } from 'drizzle-orm/mysql-core';
import fs from 'fs';
import { DB } from 'src/utils';
import { diffTestSchemasPushMysql } from 'tests/schemaDiffer';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { prepareTestDatabase, TestDatabase } from './mocks';

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

if (!fs.existsSync('tests/push/mysql')) {
	fs.mkdirSync('tests/push/mysql');
}

test('add check constraint to table', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}, (table) => ({
			checkConstraint1: check('some_check1', sql`${table.values} < 100`),
			checkConstraint2: check('some_check2', sql`'test' < 100`),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			type: 'create_check_constraint',
			tableName: 'test',
			schema: '',
			data: 'some_check1;\`test\`.\`values\` < 100',
		},
		{
			data: "some_check2;'test' < 100",
			schema: '',
			tableName: 'test',
			type: 'create_check_constraint',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE \`test\` ADD CONSTRAINT \`some_check1\` CHECK (\`test\`.\`values\` < 100);',
		`ALTER TABLE \`test\` ADD CONSTRAINT \`some_check2\` CHECK ('test' < 100);`,
	]);

	await client.query(`DROP TABLE \`test\`;`);
});

test('drop check constraint to table', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}, (table) => ({
			checkConstraint1: check('some_check1', sql`${table.values} < 100`),
			checkConstraint2: check('some_check2', sql`'test' < 100`),
		})),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			type: 'delete_check_constraint',
			tableName: 'test',
			schema: '',
			constraintName: 'some_check1',
		},
		{
			constraintName: 'some_check2',
			schema: '',
			tableName: 'test',
			type: 'delete_check_constraint',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE \`test\` DROP CONSTRAINT \`some_check1\`;',
		`ALTER TABLE \`test\` DROP CONSTRAINT \`some_check2\`;`,
	]);

	await client.query(`DROP TABLE \`test\`;`);
});

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => ({
			checkConstraint: check('some_check', sql`${table.values} < 100`),
		})),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => ({
			checkConstraint: check('some_check', sql`some new value`),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);

	await client.query(`DROP TABLE \`test\`;`);
});

test('create view', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			definition: 'select \`id\` from \`test\`',
			name: 'view',
			type: 'mysql_create_view',
			replace: false,
			sqlSecurity: 'definer',
			withCheckOption: undefined,
			algorithm: 'undefined',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = undefined
SQL SECURITY definer
VIEW \`view\` AS (select \`id\` from \`test\`);`,
	]);

	await client.query(`DROP TABLE \`test\`;`);
});

test('drop view', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { statements, sqlStatements } = await diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			name: 'view',
			type: 'drop_view',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'DROP VIEW \`view\`;',
	]);
	await client.query(`DROP TABLE \`test\`;`);
	await client.query(`DROP VIEW \`view\`;`);
});

test('alter view ".as"', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	await client.query(`DROP TABLE \`test\`;`);
	await client.query(`DROP VIEW \`view\`;`);
});

test('alter meta options with distinct in definition', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').withCheckOption('cascaded').sqlSecurity('definer').algorithm('merge').as((
			qb,
		) => qb.selectDistinct().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').withCheckOption('cascaded').sqlSecurity('definer').algorithm('undefined').as((qb) =>
			qb.selectDistinct().from(table)
		),
	};

	await expect(diffTestSchemasPushMysql(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	)).rejects.toThrowError();

	await client.query(`DROP TABLE \`test\`;`);
});
