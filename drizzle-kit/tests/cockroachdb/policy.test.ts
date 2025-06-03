import { sql } from 'drizzle-orm';
import {
	cockroachdbPolicy,
	cockroachdbRole,
	cockroachdbSchema,
	cockroachdbTable,
	int4,
} from 'drizzle-orm/cockroachdb-core';
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

test('full policy: no changes', async () => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + enable rls', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
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

test('drop policy + disable rls', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
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

test('add policy without enable rls', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' }), cockroachdbPolicy('newRls')]),
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

test('drop policy without disable rls', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' }), cockroachdbPolicy('oldRls')]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
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

test('alter policy without recreation: changing roles', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive', to: 'session_user' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO session_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy without recreation: changing using', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive', using: sql`true` })]),
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

test('alter policy without recreation: changing with check', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive', withCheck: sql`true` })]),
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

test('alter policy with recreation: changing as', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'restrictive' })]),
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

test('alter policy with recreation: changing for', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive', for: 'delete' })]),
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

test('alter policy with recreation: changing both "as" and "for"', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'restrictive', for: 'insert' })]),
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

test('alter policy with recreation: changing all fields', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive', for: 'select', using: sql`true` })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'restrictive', to: 'current_user', withCheck: sql`true` })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_user WITH CHECK (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename policy', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('newName', { as: 'permissive' })]),
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

test('rename policy in renamed table', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [
			cockroachdbPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: cockroachdbTable('users2', {
			id: int4('id').primaryKey(),
		}, (t) => [cockroachdbPolicy('newName', { as: 'permissive' })]),
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

test('create table with a policy', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: cockroachdbTable('users2', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
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

test('drop table with a policy', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users2', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { as: 'permissive' })]),
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

test('add policy with multiple "to" roles', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const role = cockroachdbRole('manager');

	const schema2 = {
		role,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { to: ['current_user', role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'CREATE ROLE "manager";',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_user, "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with rls enabled', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}).enableRLS(),
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

test('enable rls force', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}).enableRLS(),
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

test('disable rls force', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}).enableRLS(),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
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

test('drop policy with enabled rls', async (t) => {
	const role = cockroachdbRole('manager');

	const schema1 = {
		role,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { to: ['current_user', role] })]).enableRLS(),
	};

	const schema2 = {
		role,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}).enableRLS(),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
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

test('add policy with enabled rls', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}).enableRLS(),
	};

	const role = cockroachdbRole('manager');

	const schema2 = {
		role,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachdbPolicy('test', { to: ['current_user', role] })]).enableRLS(),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	const st0 = [
		'CREATE ROLE "manager";',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_user, "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + link table', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
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

test('link table', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
		rls: cockroachdbPolicy('test', { as: 'permissive' }),
	};

	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
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

test('unlink table', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }),
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

test('drop policy with link', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
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

test('add policy in table and with link table', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	}, () => [
		cockroachdbPolicy('test1', { to: 'current_user' }),
	]);

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
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
		'CREATE POLICY "test1" ON "users" AS PERMISSIVE FOR ALL TO current_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('link non-schema table', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = { users };

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
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

test('unlink non-schema table', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }),
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

test('add policy + link non-schema table', async (t) => {
	const cities = cockroachdbTable('cities', {
		id: int4('id').primaryKey(),
	}).enableRLS();

	const schema1 = {
		cities,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		cities,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test2'),
		]),
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(cities),
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

test('add policy + link non-schema table from auth schema', async (t) => {
	const authSchema = cockroachdbSchema('auth');
	const cities = authSchema.table('cities', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		authSchema,
		cities,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		authSchema,
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test2'),
		]),
		cities,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(cities),
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

test('rename policy that is linked', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('newName', { as: 'permissive' }).link(users),
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

test('alter policy that is linked', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive', to: 'current_user' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy that is linked: withCheck', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
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

test('alter policy that is linked: using', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
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

test('alter policy that is linked: using', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: cockroachdbPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		users,
		rls: cockroachdbPolicy('test', { for: 'delete' }).link(users),
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

test('alter policy in the table', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { as: 'permissive', to: 'current_user' }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_user;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy in the table: withCheck', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { as: 'permissive', withCheck: sql`true` }),
		]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { as: 'permissive', withCheck: sql`false` }),
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

test('alter policy in the table: using', async (t) => {
	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { as: 'permissive', using: sql`true` }),
		]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { as: 'permissive', using: sql`false` }),
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

test('alter policy in the table: using', async (t) => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { for: 'insert' }),
		]),
	};

	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}, (t) => [
			cockroachdbPolicy('test', { for: 'delete' }),
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
