import { sql } from 'drizzle-orm';
import { bit, index, int, mssqlTable, text, uniqueIndex, varchar } from 'drizzle-orm/mssql-core';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
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

test('indexes #0', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: varchar('name', { length: 3000 }),
			},
			(
				t,
			) => [
				index('changeName').on(t.name),
				index('removeColumn').on(t.name, t.id),
				index('addColumn').on(t.name),
				index('removeWhere').on(t.name).where(sql`${t.name} != 'name'`),
				index('addWhere').on(t.name),
			],
		),
	};

	const schema2 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: varchar('name', { length: 3000 }),
			},
			(t) => [
				index('newName').on(t.name),
				index('removeColumn').on(t.name),
				index('addColumn').on(t.name, t.id),
				index('removeWhere').on(t.name),
				index('addWhere').on(t.name).where(sql`${t.name} != 'name'`),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	expect(st).toStrictEqual([
		'DROP INDEX [changeName] ON [users];',
		'DROP INDEX [removeColumn] ON [users];',
		'DROP INDEX [addColumn] ON [users];',
		'DROP INDEX [removeWhere] ON [users];',
		'DROP INDEX [addWhere] ON [users];',
		'CREATE INDEX [newName] ON [users] ([name]);',
		'CREATE INDEX [removeColumn] ON [users] ([name]);',
		'CREATE INDEX [addColumn] ON [users] ([name],[id]);',
		'CREATE INDEX [removeWhere] ON [users] ([name]);',
		"CREATE INDEX [addWhere] ON [users] ([name]) WHERE [users].[name] != 'name';",
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX [changeName] ON [users];',
		'DROP INDEX [addColumn] ON [users];',
		'DROP INDEX [addWhere] ON [users];',
		'DROP INDEX [removeColumn] ON [users];',
		'DROP INDEX [removeWhere] ON [users];',
		'CREATE INDEX [newName] ON [users] ([name]);',
		'CREATE INDEX [addColumn] ON [users] ([name],[id]);',
		"CREATE INDEX [addWhere] ON [users] ([name]) WHERE [users].[name] != 'name';",
		'CREATE INDEX [removeColumn] ON [users] ([name]);',
		'CREATE INDEX [removeWhere] ON [users] ([name]);',
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3255
test('indexes #2', async () => {
	const table1 = mssqlTable('table1', {
		col1: int(),
		col2: int(),
	}, () => [
		index1,
		index2,
		index3,
		index4,
		index5,
		index6,
	]);

	const index1 = uniqueIndex('index1').on(table1.col1);
	const index2 = uniqueIndex('index2').on(table1.col1, table1.col2);
	const index3 = index('index3').on(table1.col1);
	const index4 = index('index4').on(table1.col1, table1.col2);
	const index5 = index('index5').on(sql`${table1.col1} asc`);
	const index6 = index('index6').on(sql`${table1.col1} asc`, sql`${table1.col2} desc`);

	const schema1 = { table1 };

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt1 = [
		'CREATE TABLE [table1] (\n'
		+ '\t[col1] int,\n'
		+ '\t[col2] int\n'
		+ ');\n',
		`CREATE UNIQUE INDEX [index1] ON [table1] ([col1]);`,
		`CREATE UNIQUE INDEX [index2] ON [table1] ([col1],[col2]);`,
		'CREATE INDEX [index3] ON [table1] ([col1]);',
		'CREATE INDEX [index4] ON [table1] ([col1],[col2]);',
		'CREATE INDEX [index5] ON [table1] ([col1] asc);',
		'CREATE INDEX [index6] ON [table1] ([col1] asc,[col2] desc);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});

test('adding basic indexes', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 1000 }),
		}),
	};

	const schema2 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: varchar('name', { length: 1000 }),
			},
			(t) => [
				index('indx1')
					.on(t.name)
					.where(sql`name != 'alex'`),
				index('indx2').on(t.id),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		`CREATE INDEX [indx1] ON [users] ([name]) WHERE name != 'alex';`,
		`CREATE INDEX [indx2] ON [users] ([id]);`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('dropping basic index', async () => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: varchar('name', { length: 100 }),
			},
			(t) => [index('indx1').on(t.name, t.id)],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 100 }),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [`DROP INDEX [indx1] ON [users];`];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('indexes test case #1', async () => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: varchar('id').primaryKey(),
				name: text('name').notNull(),
				description: text('description'),
				imageUrl: text('image_url'),
				inStock: bit('in_stock').default(true),
			},
			(t) => [
				index('indx').on(t.id),
				index('indx4').on(t.id),
			],
		),
	};

	const schema2 = {
		users: mssqlTable(
			'users',
			{
				id: varchar('id').primaryKey(),
				name: text('name').notNull(),
				description: text('description'),
				imageUrl: text('image_url'),
				inStock: bit('in_stock').default(true),
			},
			(t) => [
				index('indx').on(t.id),
				index('indx4').on(t.id),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('Alter where property', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 1000 }),
		}, (t) => [
			index('indx2').on(t.name).where(sql`name != 'alex'`),
		]),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 1000 }),
		}, (t) => [
			index('indx2').on(t.name).where(sql`name != 'alex2'`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	expect(st).toStrictEqual([
		'DROP INDEX [indx2] ON [users];',
		"CREATE INDEX [indx2] ON [users] ([name]) WHERE name != 'alex2';",
	]);
	expect(pst).toStrictEqual([]);
});
