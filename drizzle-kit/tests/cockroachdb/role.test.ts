import { cockroachdbRole } from 'drizzle-orm/cockroachdb-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
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

test('create role', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: cockroachdbRole('manager'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: cockroachdbRole('manager', { createDb: true, createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager" WITH CREATEDB CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with some properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: cockroachdbRole('manager', { createDb: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager" WITH CREATEDB;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop role', async (t) => {
	const schema1 = { manager: cockroachdbRole('manager') };

	const schema2 = {};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'DROP ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create and drop role', async (t) => {
	const schema1 = {
		manager: cockroachdbRole('manager'),
	};

	const schema2 = {
		superuser: cockroachdbRole('superuser'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager', 'superuser'] } },
	});

	const st0 = [
		'DROP ROLE "manager";',
		'CREATE ROLE "superuser";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename role - recreate', async (t) => {
	const schema1 = {
		manager: cockroachdbRole('manager'),
	};

	const schema2 = {
		superuser: cockroachdbRole('superuser'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager', 'superuser'] } },
	});

	const st0 = [
		`DROP ROLE "manager";`,
		`CREATE ROLE "superuser";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter all role field', async (t) => {
	const schema1 = {
		manager: cockroachdbRole('manager'),
	};

	const schema2 = {
		manager: cockroachdbRole('manager', { createDb: true, createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEDB CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createdb in role', async (t) => {
	const schema1 = {
		manager: cockroachdbRole('manager'),
	};

	const schema2 = {
		manager: cockroachdbRole('manager', { createDb: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEDB NOCREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createrole in role', async (t) => {
	const schema1 = {
		manager: cockroachdbRole('manager'),
	};

	const schema2 = {
		manager: cockroachdbRole('manager', { createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH NOCREATEDB CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
