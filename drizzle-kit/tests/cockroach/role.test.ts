import { cockroachRole } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test('create role', async ({ db }) => {
	const schema1 = {};

	const schema2 = {
		manager: cockroachRole('manager'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with properties', async ({ db }) => {
	const schema1 = {};

	const schema2 = {
		manager: cockroachRole('manager', { createDb: true, createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager" WITH CREATEDB CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with some properties', async ({ db }) => {
	const schema1 = {};

	const schema2 = {
		manager: cockroachRole('manager', { createDb: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'CREATE ROLE "manager" WITH CREATEDB;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop role', async ({ db }) => {
	const schema1 = { manager: cockroachRole('manager') };

	const schema2 = {};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'DROP ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create and drop role', async ({ db }) => {
	const schema1 = {
		manager: cockroachRole('manager'),
	};

	const schema2 = {
		superuser: cockroachRole('superuser'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager', 'superuser'] } } });
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

test('rename role - recreate', async ({ db }) => {
	const schema1 = {
		manager: cockroachRole('manager'),
	};

	const schema2 = {
		superuser: cockroachRole('superuser'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager', 'superuser'] } } });
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

test('alter all role field', async ({ db }) => {
	const schema1 = {
		manager: cockroachRole('manager'),
	};

	const schema2 = {
		manager: cockroachRole('manager', { createDb: true, createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEDB CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createdb in role', async ({ db }) => {
	const schema1 = {
		manager: cockroachRole('manager'),
	};

	const schema2 = {
		manager: cockroachRole('manager', { createDb: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEDB NOCREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createrole in role', async ({ db }) => {
	const schema1 = {
		manager: cockroachRole('manager'),
	};

	const schema2 = {
		manager: cockroachRole('manager', { createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH NOCREATEDB CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
