import { sql } from 'drizzle-orm';
import { authUid, crudPolicy } from 'drizzle-orm/neon';
import { integer, pgPolicy, pgRole, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
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
		users: pgTable.withRLS('users', {
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
		users: pgTable.withRLS('users', {
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
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('disable rls force', async (t) => {
	const schema1 = {
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}),
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
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]),
	};

	const schema2 = {
		role,
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}),
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
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: [role] })]),
	};

	const schema2 = {
		role,
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
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

test('add policy with enabled rls', async (t) => {
	const schema1 = {
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager');

	const schema2 = {
		role,
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]),
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
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager');

	const schema2 = {
		role,
		users: pgTable.withRLS('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: [role] })]),
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
	const cities = pgTable.withRLS('cities', {
		id: integer('id').primaryKey(),
	});

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

// https://github.com/drizzle-team/drizzle-orm/issues/4198
test('create/alter policy for select, insert, update, delete', async () => {
	const authenticatedRole = pgRole('authenticated');

	const schema1 = {
		authenticatedRole,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [
			pgPolicy('policy 1', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'select',
				using: sql`
(
	(SELECT current_setting('auth.uid', true)) = 'some-user-id'
)
`,
			}),
			pgPolicy('policy 2', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'insert',
				withCheck: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id')`,
			}),
			pgPolicy('policy 3', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'update',
				using: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id')`,
				withCheck: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id')`,
			}),
			pgPolicy('policy 4', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'delete',
				using: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id')`,
			}),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);

	await db.query(`SET auth.uid = 'some-user-id';`);
	const { sqlStatements: pst1 } = await push({
		db,
		to: schema1,
		entities: { roles: { include: [authenticatedRole.name] } },
	});
	const expectedSt1 = [
		'CREATE ROLE "authenticated";',
		'CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "policy 1" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (\n'
		+ '(\n'
		+ "\t(SELECT current_setting('auth.uid', true)) = 'some-user-id'\n"
		+ ')\n'
		+ ');',
		`CREATE POLICY "policy 2" ON "users" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((SELECT current_setting('auth.uid', true)) = 'some-user-id'));`,
		`CREATE POLICY "policy 3" ON "users" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((SELECT current_setting('auth.uid', true)) = 'some-user-id')) WITH CHECK (((SELECT current_setting('auth.uid', true)) = 'some-user-id'));`,
		`CREATE POLICY "policy 4" ON "users" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((SELECT current_setting('auth.uid', true)) = 'some-user-id'));`,
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		authenticatedRole,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('policy 1', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'select',
				// some-user-id => some-user-id11
				using: sql`
	(
		(SELECT current_setting('auth.uid', true)) = 'some-user-id1'
	)
	`,
			}),
			pgPolicy('policy 2', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'insert',
				withCheck: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id1')`,
			}),
			pgPolicy('policy 3', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'update',
				using: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id1')`,
				withCheck: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id1')`,
			}),
			pgPolicy('policy 4', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'delete',
				using: sql`((SELECT current_setting('auth.uid', true)) = 'some-user-id1')`,
			}),
		]),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [authenticatedRole.name] } },
	});

	const expectedSt2 = [
		'ALTER POLICY "policy 1" ON "users" TO "authenticated" USING (\n'
		+ '\t(\n'
		+ "\t\t(SELECT current_setting('auth.uid', true)) = 'some-user-id1'\n"
		+ '\t)\n'
		+ '\t);',
		`ALTER POLICY "policy 2" ON "users" TO "authenticated" WITH CHECK (((SELECT current_setting('auth.uid', true)) = 'some-user-id1'));`,
		`ALTER POLICY "policy 3" ON "users" TO "authenticated" USING (((SELECT current_setting('auth.uid', true)) = 'some-user-id1')) WITH CHECK (((SELECT current_setting('auth.uid', true)) = 'some-user-id1'));`,
		`ALTER POLICY "policy 4" ON "users" TO "authenticated" USING (((SELECT current_setting('auth.uid', true)) = 'some-user-id1'));`,
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual([]); // using/with check is not handled for push

	const { sqlStatements: st3 } = await diff(n2, schema2, []);

	const { sqlStatements: pst3 } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [authenticatedRole.name] } },
	});

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	await db.query(`RESET auth.uid;`);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4198
test('create/alter policy with comments', async () => {
	const authenticatedRole = pgRole('authenticated');

	const schema1 = {
		authenticatedRole,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('policy 1', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'select',
				using: sql`
(
	-- comment1
	(SELECT current_setting('auth.uid', true)) = 'some-user-id'
)
	OR
(
	-- comment2
	(SELECT current_setting('auth.uid', true)) = 'some-user-id1'
)
    `,
			}),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);

	await db.query(`SET auth.uid = 'some-user-id';`);
	const { sqlStatements: pst1 } = await push({
		db,
		to: schema1,
		entities: { roles: { include: [authenticatedRole.name] } },
	});
	const expectedSt1 = [
		'CREATE ROLE "authenticated";',
		'CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n',
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "policy 1" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (\n'
		+ '(\n'
		+ '\t-- comment1\n'
		+ "\t(SELECT current_setting('auth.uid', true)) = 'some-user-id'\n"
		+ ')\n'
		+ '\tOR\n'
		+ '(\n'
		+ '\t-- comment2\n'
		+ "\t(SELECT current_setting('auth.uid', true)) = 'some-user-id1'\n"
		+ ')\n'
		+ '    );',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		authenticatedRole,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('policy 1', {
				as: 'permissive',
				to: authenticatedRole,
				for: 'select',
				using: sql`
(
	-- comment1
	(SELECT current_setting('auth.uid', true)) = 'some-user-id'
)
	OR
(
	-- comment2
	(SELECT current_setting('auth.uid', true)) = 'some-user-id2'
)
    `,
			}),
		]),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, schema2, []);

	const { sqlStatements: pst2 } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [authenticatedRole.name] } },
	});

	const expectedSt2 = [
		'ALTER POLICY "policy 1" ON "users" TO "authenticated" USING (\n'
		+ '(\n'
		+ '\t-- comment1\n'
		+ "\t(SELECT current_setting('auth.uid', true)) = 'some-user-id'\n"
		+ ')\n'
		+ '\tOR\n'
		+ '(\n'
		+ '\t-- comment2\n'
		+ "\t(SELECT current_setting('auth.uid', true)) = 'some-user-id2'\n"
		+ ')\n'
		+ '    );',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual([]); // using/with check is not handled in push

	const { sqlStatements: st3 } = await diff(n2, schema2, []);

	const { sqlStatements: pst3 } = await push({
		db,
		to: schema2,
		entities: { roles: { include: [authenticatedRole.name] } },
	});

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	await db.query(`RESET auth.uid;`);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4279
test('create policy for neon', async () => {
	const authenticatedRole = pgRole('authenticated');
	const projectsTable = pgTable(
		'projects',
		{
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
			owner: text('owner').notNull(),
		},
		(table) => [
			crudPolicy({
				role: authenticatedRole,
				read: true,
				modify: authUid(table.owner),
			}),
		],
	);

	const schema1 = {
		authenticatedRole,
		projectsTable,
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);

	await db.query(`create schema auth;`);
	await db.query(`create or replace function auth.user_id()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN 'some_user_id';
END;
$$;`);
	const { sqlStatements: pst1 } = await push({
		db,
		to: schema1,
		schemas: ['public'],
		entities: { roles: { include: [authenticatedRole.name] } },
	});
	const expectedSt1 = [
		'CREATE ROLE "authenticated";',
		'CREATE TABLE "projects" (\n\t"id" integer PRIMARY KEY,\n\t"name" text NOT NULL,\n\t"owner" text NOT NULL\n);\n',
		'ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "crud-authenticated-policy-select" ON "projects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);',
		'CREATE POLICY "crud-authenticated-policy-insert" ON "projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "projects"."owner"));',
		'CREATE POLICY "crud-authenticated-policy-update" ON "projects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "projects"."owner")) WITH CHECK ((select auth.user_id() = "projects"."owner"));',
		'CREATE POLICY "crud-authenticated-policy-delete" ON "projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "projects"."owner"));',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema1, []);

	const { sqlStatements: pst2 } = await push({
		db,
		to: schema1,
		schemas: ['public'],
		entities: { roles: { include: [authenticatedRole.name] } },
	});

	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});
