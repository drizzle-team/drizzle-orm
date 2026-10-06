import { integer, pgPolicy, pgRole, pgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, drizzleToDDL, prepareTestDatabase, push, TestDatabase } from '../postgres/mocks';

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
		manager: pgRole('manager'),
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
		manager: pgRole('manager', {
			createDb: true,
			createRole: true,
			inherit: false,
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		`CREATE ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with some properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'CREATE ROLE "manager" WITH CREATEDB NOINHERIT;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop role', async (t) => {
	const schema1 = { manager: pgRole('manager') };

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

test('create and drop role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager', 'admin'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager', 'admin'] } },
	});

	const st0 = [
		'CREATE ROLE "admin";',
		'DROP ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const renames = ['manager->admin'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1, entities: { roles: { include: ['manager', 'admin'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames,
		entities: { roles: { include: ['manager', 'admin'] } },
	});

	const st0 = [
		'ALTER ROLE "manager" RENAME TO "admin";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter all role field', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', {
			createDb: true,
			createRole: true,
			inherit: false,
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		`ALTER ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createdb in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEDB;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createrole in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter inherit in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { inherit: false }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'ALTER ROLE "manager" WITH NOINHERIT;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('a role rename changes no policy and no privilege that names the role', async () => {
	// The schema does not manage this role, and `public` is a built-in name.
	const auditor = pgRole('auditor').existing();
	const schema = (roleName: string) => {
		const role = pgRole(roleName);
		const users = pgTable('users', { id: integer() }, () => [
			pgPolicy('users_read', { for: 'select', to: [role, auditor] }),
			pgPolicy('users_list', { for: 'select', to: 'public' }),
		]);
		return { role, users };
	};
	// A drizzle schema cannot declare a privilege, so the state gets its row here.
	const state = (roleName: string) => {
		const { ddl } = drizzleToDDL(schema(roleName));
		ddl.privileges.push({
			schema: 'public',
			table: 'users',
			grantor: 'postgres',
			grantee: roleName,
			type: 'SELECT',
			isGrantable: false,
		});
		return ddl;
	};
	await db.query('CREATE ROLE "auditor";');
	for (const it of (await diff({}, schema('staff'), [])).sqlStatements) await db.query(it);
	await db.query('GRANT SELECT ON "users" TO "staff";');

	// The new name sorts before the other role of the policy, and the old name sorts after it.
	const { sqlStatements } = await diff(state('staff'), state('admin'), ['staff->admin']);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "staff" RENAME TO "admin";']);

	for (const it of sqlStatements) await db.query(it);
	const entities = { roles: { include: ['admin'] } };
	expect((await push({ db, to: schema('admin'), entities })).sqlStatements).toStrictEqual([]);
	expect(await db.query(`select has_table_privilege('admin', 'users', 'SELECT') as granted`)).toStrictEqual([
		{ granted: true },
	]);
});

// Postgres refuses to drop a role that a policy still names.
test.each([
	{
		name: 'a drop of the policy that names it',
		policies: [[pgPolicy('readers', { for: 'select', to: pgRole('staff') })], []],
		sql: [
			'DROP POLICY "readers" ON "users";',
			'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
			'DROP ROLE "staff";',
		],
	},
	{
		name: 'a policy that no longer names it',
		policies: [
			[pgPolicy('readers', { for: 'select', to: pgRole('staff') })],
			[pgPolicy('readers', { for: 'select', to: 'public' })],
		],
		sql: ['ALTER POLICY "readers" ON "users" TO public;', 'DROP ROLE "staff";'],
	},
])('a role drop together with $name writes SQL that runs', async ({ policies: [before, after], sql }) => {
	const users = (policies: ReturnType<typeof pgPolicy>[]) => pgTable('users', { id: integer() }, () => policies);
	const entities = { roles: { include: ['staff'] } };

	const { sqlStatements: st } = await diff(
		{ staff: pgRole('staff'), users: users(before) },
		{ users: users(after) },
		[],
	);
	await push({ db, to: { staff: pgRole('staff'), users: users(before) }, entities });
	const { sqlStatements: pst } = await push({ db, to: { users: users(after) }, entities });

	expect(st).toStrictEqual(sql);
	expect(pst).toStrictEqual(sql);
});
