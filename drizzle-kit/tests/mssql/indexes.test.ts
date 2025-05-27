import { sql } from 'drizzle-orm';
import { bit, index, int, mssqlTable, text, varchar } from 'drizzle-orm/mssql-core';
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

	const st0 = [
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
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
