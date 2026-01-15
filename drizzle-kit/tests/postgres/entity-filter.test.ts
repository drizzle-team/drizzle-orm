import { sql } from 'drizzle-orm';
import { pgSchema, pgView, serial } from 'drizzle-orm/pg-core';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

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

describe('push', () => {
	test('push schema #1', async () => {
		const to = { dev: pgSchema('dev') };
		const st0 = ['CREATE SCHEMA "dev";\n'];

		{
			const { sqlStatements: pst } = await push({ db, to });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: [] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}
	});

	test('push schema #2', async () => {
		const to = { dev: pgSchema('dev'), dev2: pgSchema('dev2') };
		const st0 = ['CREATE SCHEMA "dev";\n', 'CREATE SCHEMA "dev2";\n'];

		{
			const { sqlStatements: pst } = await push({ db, to });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
			expect(pst).toStrictEqual(['CREATE SCHEMA "dev";\n']);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: [] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
			expect(pst).toStrictEqual(['CREATE SCHEMA "dev2";\n']);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}
	});

	test('push schema #3', async () => {
		const to = { dev: pgSchema('dev').existing(), dev2: pgSchema('dev2') };
		const st0 = ['CREATE SCHEMA "dev2";\n'];

		{
			const { sqlStatements: pst } = await push({ db, to });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: [] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}
	});

	test('push schema #4', async () => {
		const dev = pgSchema('dev');
		const table1 = dev.table('table1', { id: serial() });
		const table2 = dev.table('table2', { id: serial() });
		const to = { dev, table1, table2, dev2: pgSchema('dev2') };

		const st0 = [
			'CREATE SCHEMA "dev";\n',
			'CREATE SCHEMA "dev2";\n',
			'CREATE TABLE "dev"."table1" (\n\t"id" serial\n);\n',
			'CREATE TABLE "dev"."table2" (\n\t"id" serial\n);\n',
		];

		{
			const { sqlStatements: pst } = await push({ db, to });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
			expect(pst).toStrictEqual([
				'CREATE SCHEMA "dev";\n',
				'CREATE TABLE "dev"."table1" (\n\t"id" serial\n);\n',
				'CREATE TABLE "dev"."table2" (\n\t"id" serial\n);\n',
			]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: [] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
			expect(pst).toStrictEqual(['CREATE SCHEMA "dev2";\n']);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}
	});

	test('push schema #5', async () => {
		const dev = pgSchema('dev').existing();
		const table1 = dev.table('table1', { id: serial() });
		const table2 = dev.table('table2', { id: serial() });
		const to = { dev, table1, table2, dev2: pgSchema('dev2') };
		const st0 = ['CREATE SCHEMA "dev2";\n'];

		{
			const { sqlStatements: pst } = await push({ db, to });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: [] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}

		{
			const { sqlStatements: pst } = await push({ db, to, schemas: ['public', '!dev'] });
			expect(pst).toStrictEqual(st0);
			await _.clear();
		}
	});

	test('push schema #6', async () => {
		await db.query('create schema dev');

		const to = { dev: pgSchema('dev').existing() };
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual([]);
	});

	test('push schema #6', async () => {
		await db.query('create schema dev;');
		await db.query('create table dev.users (id int);');

		const to = { dev: pgSchema('dev').existing() };
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual([]);
	});

	test('push schema #7', async () => {
		await db.query('create schema dev;');
		await db.query('create table dev.users (id int);');

		const to = { dev: pgSchema('dev') };
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual(['DROP TABLE "dev"."users";']);
	});

	test('push schema #8', async () => {
		await db.query('create schema dev;');
		await db.query('create table dev.users (id int);');
		await db.query('create view v as (select * from dev.users);');

		const to = { dev: pgSchema('dev') };
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual([
			'DROP VIEW "v";',
			'DROP TABLE "dev"."users";',
		]);
	});

	test('push schema #9', async () => {
		await db.query('create schema dev;');
		await db.query('create table dev.users (id int);');
		await db.query('create view dev.v as (select * from dev.users);');

		const to = { dev: pgSchema('dev') };
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual([
			'DROP VIEW "dev"."v";',
			'DROP TABLE "dev"."users";',
		]);
	});

	test('push schema #10', async () => {
		await db.query('create schema dev;');
		await db.query('create table dev.users (id int);');
		await db.query('create view v as (select * from dev.users);');

		const to = { dev: pgSchema('dev').existing(), v: pgView('v', {}).existing() };
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual([]);
	});

	test('huge schema #1', async () => {
		const schema = await import('./schemas/schema1');

		await push({ db, to: schema });

		const res1 = await push({ db, to: { ...schema, core: pgSchema('core').existing() } });
		expect(res1.sqlStatements).toStrictEqual([]);

		const res2 = await push({ db, to: schema });
		expect(res2.sqlStatements).toStrictEqual([]);
	});

	test('push schema #10', async () => {
		{
			await db.query('create schema dev;');
			await db.query('create schema dev2;');
			await db.query('create schema test;');
			await db.query('create schema test2;');

			const to = { dev2: pgSchema('dev2'), test2: pgSchema('test2'), test: pgSchema('test') };
			const { sqlStatements: pst } = await push({ db, to, schemas: ['test2', '!dev'] });
			expect(pst).toStrictEqual([]);
			await _.clear();
		}

		{
			await db.query('create schema dev;');
			await db.query('create schema dev2;');
			await db.query('create schema test;');
			await db.query('create schema test2;');

			const to = { dev2: pgSchema('dev2'), test2: pgSchema('test2') };
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
			expect(pst).toStrictEqual([`DROP SCHEMA "test";\n`]);
			await _.clear();
		}

		{
			await db.query('create schema dev;');
			await db.query('create schema dev2;');
			await db.query('create schema test;');
			await db.query('create schema test2;');

			const to = { dev2: pgSchema('dev2'), test2: pgSchema('test2') };
			const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev', '!dev2'] });
			expect(pst).toStrictEqual([`DROP SCHEMA "test";\n`]);
			await _.clear();
		}
	});
});

describe('schema filters', () => {
	test('schema filters #1', () => {
		const dbSchemas = ['public', 'admin', 'sales'];

		const filter = prepareEntityFilter('postgresql', {
			schemas: ['public'],
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		}, []);

		const filtered = dbSchemas.filter((schema) => filter({ type: 'schema', name: schema }));

		expect(filtered).toStrictEqual(['public']);
	});

	test('schema filters #2', () => {
		const dbSchemas = ['public', 'test', 'admin'];

		const filter = prepareEntityFilter('postgresql', {
			schemas: ['!test'],
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		}, []);

		const filtered = dbSchemas.filter((schema) => filter({ type: 'schema', name: schema }));

		expect(filtered).toStrictEqual(['public', 'admin']);
	});

	test('schema filters #3', () => {
		const dbSchemas = ['users_1', 'users_2', 'users_3', 'admin', 'users_4'];

		const filter = prepareEntityFilter('postgresql', {
			schemas: ['users_*', '!users_4', '!ad*'],
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		}, []);

		const filtered = dbSchemas.filter((schema) => filter({ type: 'schema', name: schema }));

		expect(filtered).toStrictEqual(['users_1', 'users_2', 'users_3']);
	});
});
