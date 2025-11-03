import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgRole, pgSchema, pgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from '../postgres/mocks';

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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy without enable rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' }), pgPolicy('newRls')]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' }), pgPolicy('oldRls')]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, ignoreSubsequent: true });
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

test('alter policy without recreation: changing roles #2', async (t) => {
	const role = pgRole('test');
	const schema1 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', to: role })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: [role.name] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [role.name] } },
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO "test";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('alter policy without recreation: changing roles', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', to: 'current_role' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, ignoreSubsequent: true });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_role;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy without recreation: changing using', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', using: sql`true` })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', withCheck: sql`true` })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', for: 'delete' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive', for: 'insert' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', for: 'select', using: sql`true` })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive', to: 'current_role', withCheck: sql`true` })]),
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
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_role WITH CHECK (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('alter policy with recreation: changing all fields #2', async (t) => {
	const role = pgRole('test');
	const schema1 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', for: 'select', using: sql`true` })]),
	};

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive', to: role, withCheck: sql`true` })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: [role.name] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [role.name] } },
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO "test" WITH CHECK (true);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename policy', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('newName', { as: 'permissive' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [
			pgPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, (t) => [pgPolicy('newName', { as: 'permissive' })]),
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
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'CREATE TABLE "users2" (\n\t"id" integer PRIMARY KEY\n);\n',
		'ALTER TABLE "users2" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO public;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop table with a policy', async (t) => {
	const schema1 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager');

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	// TODO: @AlexBlokh: it is now really weird that I have to include role names in entities when I just have them in schema
	// if I don't - it will try to create same roles all the time
	const st0 = [
		'CREATE ROLE "manager";',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('add policy with multiple "to" roles #2', async (t) => {
	const role2 = pgRole('test');
	const schema1 = {
		role2,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager');

	const schema2 = {
		role2,
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: [role2, role] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: [role2.name, role.name] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [role2.name, role.name] } },
	});

	// TODO: @AlexBlokh: it is now really weird that I have to include role names in entities when I just have them in schema
	// if I don't - it will try to create same roles all the time
	const st0 = [
		'CREATE ROLE "manager";',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO "manager", "test";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with rls enabled', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enable rls force', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
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
	const role = pgRole('manager');

	const schema1 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]).enableRLS(),
	};

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, ignoreSubsequent: true });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager'] } },
		ignoreSubsequent: true,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('drop policy with enabled rls #2', async (t) => {
	const role = pgRole('manager');

	const schema1 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: [role] })]).enableRLS(),
	};

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
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

test('add policy with enabled rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const role = pgRole('manager');

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]).enableRLS(),
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
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('add policy with enabled rls #2', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const role = pgRole('manager');

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: [role] })]).enableRLS(),
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
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + link table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
		rls: pgPolicy('test', { as: 'permissive' }),
	};

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop policy with link', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
		'DROP POLICY "test" ON "users";',
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy in table and with link table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	}, () => [
		pgPolicy('test1', { to: 'current_user' }),
	]);

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
test('add policy in table and with link table #2', async (t) => {
	const role = pgRole('test2');
	const schema1 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	}, () => [
		pgPolicy('test1', { to: role }),
	]);

	const schema2 = {
		role,
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: [role.name] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [role.name] } },
	});

	const st0 = [
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test1" ON "users" AS PERMISSIVE FOR ALL TO "test2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('link non-schema table', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = { users };

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		'DROP POLICY "test" ON "users";',
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add policy + link non-schema table', async (t) => {
	const cities = pgTable('cities', {
		id: integer('id').primaryKey(),
	}).enableRLS();

	const schema1 = {
		cities,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		cities,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test2'),
		]),
		rls: pgPolicy('test', { as: 'permissive' }).link(cities),
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
	const authSchema = pgSchema('auth');
	const cities = authSchema.table('cities', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		authSchema,
		cities,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		authSchema,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test2'),
		]),
		cities,
		rls: pgPolicy('test', { as: 'permissive' }).link(cities),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('newName', { as: 'permissive' }).link(users),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_role;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('alter policy that is linked #2', async (t) => {
	const role = pgRole('owner');
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		role,
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		role,
		users,
		rls: pgPolicy('test', { as: 'permissive', to: role }).link(users),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: [role.name, 'test'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [role.name, 'test'] } },
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy that is linked: withCheck', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { for: 'delete' }).link(users),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', to: 'current_role' }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: ['test'] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['test'] } },
		ignoreSubsequent: true,
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO current_role;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('alter policy in the table #2', async (t) => {
	const role = pgRole('owner');
	const schema1 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', to: role }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, entities: { roles: { include: [role.name] } } });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [role.name] } },
	});

	const st0 = [
		'ALTER POLICY "test" ON "users" TO "owner";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter policy in the table: withCheck', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', withCheck: sql`true` }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', withCheck: sql`false` }),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', using: sql`true` }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', using: sql`false` }),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { for: 'insert' }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { for: 'delete' }),
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
