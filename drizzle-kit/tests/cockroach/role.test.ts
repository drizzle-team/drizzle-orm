import { cockroachPolicy, cockroachRole, cockroachTable, int4 } from 'drizzle-orm/cockroach-core';
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
		'CREATE ROLE "superuser";',
		'DROP ROLE "manager";',
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
		`CREATE ROLE "superuser";`,
		`DROP ROLE "manager";`,
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

// Cockroach refuses to drop a role that a policy still names.
test.for([
	{
		name: 'a drop of the policy that names it',
		policies: [[cockroachPolicy('readers', { for: 'select', to: cockroachRole('staff') })], []],
		sql: [
			'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
			'DROP POLICY "readers" ON "users";',
			'DROP ROLE "staff";',
		],
	},
	{
		name: 'a policy that no longer names it',
		policies: [
			[cockroachPolicy('readers', { for: 'select', to: cockroachRole('staff') })],
			[cockroachPolicy('readers', { for: 'select', to: 'public' })],
		],
		sql: ['ALTER POLICY "readers" ON "users" TO public;', 'DROP ROLE "staff";'],
	},
])('a role drop together with $name writes SQL that runs', async ({ policies: [before, after], sql }, { db }) => {
	const users = (policies: ReturnType<typeof cockroachPolicy>[]) =>
		cockroachTable('users', { id: int4() }, () => policies);
	const entities = { roles: { include: ['staff'] } };

	const { sqlStatements: st } = await diff(
		{ staff: cockroachRole('staff'), users: users(before) },
		{ users: users(after) },
		[],
	);
	await push({ db, to: { staff: cockroachRole('staff'), users: users(before) }, entities });
	const { sqlStatements: pst } = await push({ db, to: { users: users(after) }, entities });

	expect(st).toStrictEqual(sql);
	expect(pst).toStrictEqual(sql);
});
