import { sql } from 'drizzle-orm';
import { cockroachSchema, cockroachView, int4 as int } from 'drizzle-orm/cockroach-core';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { push, test } from './mocks';

test('push schema #1', async ({ db }) => {
	const to = { dev: cockroachSchema('dev') };
	const st0 = ['CREATE SCHEMA "dev";\n'];

	{
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: [] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}
});

test('push schema #2', async ({ db }) => {
	const to = { dev: cockroachSchema('dev'), dev2: cockroachSchema('dev2') };
	const st0 = ['CREATE SCHEMA "dev";\n', 'CREATE SCHEMA "dev2";\n'];

	{
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
		expect(pst).toStrictEqual(['CREATE SCHEMA "dev";\n']);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: [] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
		expect(pst).toStrictEqual(['CREATE SCHEMA "dev2";\n']);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}
});

test('push schema #3', async ({ db }) => {
	const to = { dev: cockroachSchema('dev').existing(), dev2: cockroachSchema('dev2') };
	const st0 = ['CREATE SCHEMA "dev2";\n'];

	{
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: [] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}
});

test('push schema #4', async ({ db }) => {
	const dev = cockroachSchema('dev');
	const table1 = dev.table('table1', { id: int() });
	const table2 = dev.table('table2', { id: int() });
	const to = { dev, table1, table2, dev2: cockroachSchema('dev2') };

	const st0 = [
		'CREATE SCHEMA "dev";\n',
		'CREATE SCHEMA "dev2";\n',
		'CREATE TABLE "dev"."table1" (\n\t"id" int4\n);\n',
		'CREATE TABLE "dev"."table2" (\n\t"id" int4\n);\n',
	];

	{
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
		expect(pst).toStrictEqual([
			'CREATE SCHEMA "dev";\n',
			'CREATE TABLE "dev"."table1" (\n\t"id" int4\n);\n',
			'CREATE TABLE "dev"."table2" (\n\t"id" int4\n);\n',
		]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: [] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
		expect(pst).toStrictEqual(['CREATE SCHEMA "dev2";\n']);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}
});

test('push schema #5', async ({ db }) => {
	const dev = cockroachSchema('dev').existing();
	const table1 = dev.table('table1', { id: int() });
	const table2 = dev.table('table2', { id: int() });
	const to = { dev, table1, table2, dev2: cockroachSchema('dev2') };
	const st0 = ['CREATE SCHEMA "dev2";\n'];

	{
		const { sqlStatements: pst } = await push({ db, to });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: [] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });
		expect(pst).toStrictEqual([]);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!public'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['!dev'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}

	{
		const { sqlStatements: pst } = await push({ db, to, schemas: ['dev*'] });
		expect(pst).toStrictEqual(st0);
		await db.clear();
	}
});

test('push schema #6', async ({ db }) => {
	await db.query('create schema dev');

	const to = { dev: cockroachSchema('dev').existing() };
	const { sqlStatements: pst } = await push({ db, to });
	expect(pst).toStrictEqual([]);
});

test('push schema #6', async ({ db }) => {
	await db.query('create schema dev;');
	await db.query('create table dev.users (id int);');

	const to = { dev: cockroachSchema('dev').existing() };
	const { sqlStatements: pst } = await push({ db, to });
	expect(pst).toStrictEqual([]);
});

test('push schema #7', async ({ db }) => {
	await db.query('create schema dev;');
	await db.query('create table dev.users (id int);');

	const to = { dev: cockroachSchema('dev') };
	const { sqlStatements: pst } = await push({ db, to });
	expect(pst).toStrictEqual(['DROP TABLE "dev"."users";']);
});

test('push schema #8', async ({ db }) => {
	await db.query('create schema dev;');
	await db.query('create table dev.users (id int);');
	await db.query('create view v as (select * from dev.users);');

	const to = { dev: cockroachSchema('dev') };
	const { sqlStatements: pst } = await push({ db, to });
	expect(pst).toStrictEqual([
		'DROP VIEW "v";',
		'DROP TABLE "dev"."users";',
	]);
});

test('push schema #9', async ({ db }) => {
	await db.query('create schema dev;');
	await db.query('create table dev.users (id int);');
	await db.query('create view dev.v as (select * from dev.users);');

	const to = { dev: cockroachSchema('dev') };
	const { sqlStatements: pst } = await push({ db, to });
	expect(pst).toStrictEqual([
		'DROP VIEW "dev"."v";',
		'DROP TABLE "dev"."users";',
	]);
});

test('push schema #10', async ({ db }) => {
	await db.query('create schema dev;');
	await db.query('create table dev.users (id int);');
	await db.query('create view v as (select * from dev.users);');

	const to = { dev: cockroachSchema('dev').existing(), v: cockroachView('v', {}).existing() };
	const { sqlStatements: pst } = await push({ db, to });
	expect(pst).toStrictEqual([]);
});

test('push schema #11', async ({ db }) => {
	const schema = await import('./schemas/schema0');

	await push({ db, to: schema });

	const res1 = await push({ db, to: { ...schema, core: cockroachSchema('core').existing() } });
	expect(res1.sqlStatements).toStrictEqual([]);

	const res2 = await push({ db, to: schema });
	expect(res2.sqlStatements).toStrictEqual([]);
});

test('huge schema #1', async ({ db }) => {
	const schema = await import('./schemas/schema1');

	await push({ db, to: schema });

	const res1 = await push({ db, to: { ...schema, core: cockroachSchema('core').existing() } });
	expect(res1.sqlStatements).toStrictEqual([]);

	const res2 = await push({ db, to: schema });
	expect(res2.sqlStatements).toStrictEqual([]);
});
