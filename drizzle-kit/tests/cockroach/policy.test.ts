import { sql } from 'drizzle-orm';
import { cockroachPolicy, cockroachRole, cockroachSchema, cockroachTable, int4 } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

const systemRoles = ['admin', 'root'];
test('full policy: no changes', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + enable rls', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop policy + disable rls', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy without enable rls', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' }), cockroachPolicy('newRls')]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'CREATE POLICY "newRls" ON "users" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop policy without disable rls', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' }), cockroachPolicy('oldRls')]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "oldRls" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/**
 * Subsequent push is disabled for the first test (currest_user, session_user treated as corner cases)
 * Subsequent push is enabled for the first test
 */
test('alter policy without recreation: changing roles', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', to: 'session_user' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO session_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy without recreation: changing roles #2', async ({ db }) => {
	const role = cockroachRole('owner');
	const schema1 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', to: role })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { exclude: systemRoles } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { exclude: systemRoles } },
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy without recreation: changing using', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', using: sql`true` })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO public USING (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore [using withcheck] for push
});

test('alter policy without recreation: changing with check', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', withCheck: sql`true` })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore [using withcheck] for push
});

///

test('alter policy with recreation: changing as', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'restrictive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy with recreation: changing for', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', for: 'delete' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy with recreation: changing both "as" and "for"', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'restrictive', for: 'insert' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR INSERT TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy with recreation: changing all fields', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', for: 'select', using: sql`true` })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'restrictive', to: 'current_user', withCheck: sql`true` })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_user WITH CHECK (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy with recreation: changing all fields #2', async ({ db }) => {
	const root = cockroachRole('root');
	const admin = cockroachRole('admin');
	const owner = cockroachRole('owner');
	const schema1 = {
		root,
		admin,
		owner,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', for: 'select', using: sql`true` })]),
	};

	const schema2 = {
		root,
		admin,
		owner,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'restrictive', to: owner, withCheck: sql`true` })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: true } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: true },
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO "owner" WITH CHECK (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename policy', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('newName', { as: 'permissive' })]),
	};

	const renames = [
		'public.users.test->public.users.newName',
	];

	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename policy in renamed table', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [
			cockroachPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: cockroachTable('users2', {
			id: int4('id').primaryKey(),
		}, (t) => [cockroachPolicy('newName', { as: 'permissive' })]),
	};

	const renames = ['public.users->public.users2', 'public.users2.test->public.users2.newName'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0 = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER POLICY "test" ON "users2" RENAME TO "newName";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with a policy', async ({ db }) => {
	const schema1 = {};

	const schema2 = {
		users: cockroachTable('users2', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'CREATE TABLE "users2" (\n\t"id" int4 PRIMARY KEY\n);\n',
		'ALTER TABLE "users2" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop table with a policy', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users2', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users2";',
		'DROP TABLE "users2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy with multiple "to" roles', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const role = cockroachRole('manager');

	const schema2 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: ['current_user', role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'CREATE ROLE "manager";',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_user, "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy with multiple "to" roles #2', async ({ db }) => {
	const role2 = cockroachRole('owner');
	const schema1 = {
		role2,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const role = cockroachRole('manager');

	const schema2 = {
		role2,
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: [role2, role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { exclude: systemRoles } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { exclude: systemRoles } },
	});

	const st0 = [
		'CREATE ROLE "manager";',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO "manager", "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with rls enabled', async ({ db }) => {
	const schema1 = {};

	const schema2 = {
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enable rls force', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('disable rls force', async ({ db }) => {
	const schema1 = {
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop policy with enabled rls', async ({ db }) => {
	const role = cockroachRole('manager');

	const schema1 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: ['current_user', role] })]).enableRLS(),
	};

	const schema2 = {
		role,
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, ignoreSubsequent: true });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('drop policy with enabled rls #2', async ({ db }) => {
	const role = cockroachRole('manager');

	const schema1 = {
		role,
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: [role] })]),
	};

	const schema2 = {
		role,
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['manager'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy with enabled rls', async ({ db }) => {
	const schema1 = {
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const role = cockroachRole('manager');

	const schema2 = {
		role,
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: ['current_user', role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
		ignoreSubsequent: true,
	});

	const st0 = [
		'CREATE ROLE "manager";',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_user, "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy with enabled rls #2', async ({ db }) => {
	const role2 = cockroachRole('owner');
	const schema1 = {
		role2,
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const role = cockroachRole('manager');

	const schema2 = {
		role2,
		role,
		users: cockroachTable.withRLS('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: [role2, role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['owner'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { exclude: systemRoles } },
	});

	const st0 = [
		'CREATE ROLE "manager";',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO "manager", "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + link table', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('link table', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
		rls: cockroachPolicy('test', { as: 'permissive' }),
	};

	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unlink table', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop policy with link', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy in table and with link table', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	}, () => [
		cockroachPolicy('test1', { to: 'current_user' }),
	]);

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test1" ON "users" AS PERMISSIVE FOR ALL TO current_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy in table and with link table #2', async ({ db }) => {
	const role = cockroachRole('owner');
	const schema1 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	}, () => [
		cockroachPolicy('test1', { to: role }),
	]);

	const schema2 = {
		role,
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['owner'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['owner'] } },
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test1" ON "users" AS PERMISSIVE FOR ALL TO "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('link non-schema table', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = { users };

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unlink non-schema table', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + link non-schema table', async ({ db }) => {
	const cities = cockroachTable.withRLS('cities', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		cities,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		cities,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test2'),
		]),
		rls: cockroachPolicy('test', { as: 'permissive' }).link(cities),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "cities" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + link non-schema table from auth schema', async ({ db }) => {
	const authSchema = cockroachSchema('auth');
	const cities = authSchema.table('cities', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		authSchema,
		cities,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		authSchema,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test2'),
		]),
		cities,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(cities),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'ALTER TABLE "auth"."cities" ENABLE ROW LEVEL SECURITY;',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "auth"."cities" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
	expect(pst).toStrictEqual([
		'ALTER TABLE "auth"."cities" ENABLE ROW LEVEL SECURITY;',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "auth"."cities" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
});

test('rename policy that is linked', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('newName', { as: 'permissive' }).link(users),
	};

	const renames = [
		'public.users.test->public.users.newName',
	];

	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy that is linked', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive', to: 'current_user' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy that is linked #2', async ({ db }) => {
	const role = cockroachRole('owner');
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		role,
		users,
		rls: cockroachPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		role,
		users,
		rls: cockroachPolicy('test', { as: 'permissive', to: role }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['owner'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['owner'] } },
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy that is linked: withCheck', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (false);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore [using withcheck] for push
});

test('alter policy that is linked: using', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO public USING (false);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore [using withcheck] for push
});

test('alter policy that is linked: using', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachPolicy('test', { for: 'delete' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

////

test('alter policy in the table', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive', to: 'current_user' }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy in the table #2', async ({ db }) => {
	const role = cockroachRole('owner');
	const schema1 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		role,
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive', to: role }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { exclude: systemRoles } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { exclude: systemRoles } },
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy in the table: withCheck', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive', withCheck: sql`true` }),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive', withCheck: sql`false` }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (false);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore [using withcheck] for push
});

test('alter policy in the table: using', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive', using: sql`true` }),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { as: 'permissive', using: sql`false` }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO public USING (false);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore [using withcheck] for push
});

test('alter policy in the table: using', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { for: 'insert' }),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachPolicy('test', { for: 'delete' }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
