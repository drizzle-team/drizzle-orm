import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgRole, pgSchema, pgTable } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diff } from '../postgres/mocks';

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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "newRls" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "oldRls" ON "users" CASCADE;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public USING (true);',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (true);',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR INSERT TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_role WITH CHECK (true);',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, [
		'public.users.test->public.users.newName',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, [
		'public.users->public.users2',
		'public.users2.test->public.users2.newName',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER POLICY "test" ON "users2" RENAME TO "newName";',
	]);
});

test('create table with a policy', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users2" (\n\t"id" integer PRIMARY KEY\n);\n',
		'ALTER TABLE "users2" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO public;',
	]);
});

test('drop table with a policy', async (t) => {
	const schema1 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users2" CASCADE;',
		'DROP TABLE "users2" CASCADE;',
	]);
});

test('add policy with multiple "to" roles', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	]);
});

test('create table with rls enabled', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;']);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;']);
});

test('drop policy with enabled rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]).enableRLS(),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
});

test('add policy with enabled rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]).enableRLS(),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test1" ON "users" AS PERMISSIVE FOR ALL TO current_user;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
});

test('link non-schema table', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
});

test('unlink non-schema table', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive' }),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
});

test('add policy + link non-schema table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const cities = pgTable('cities', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test2'),
		]),
		rls: pgPolicy('test', { as: 'permissive' }).link(cities),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test" ON "cities" AS PERMISSIVE FOR ALL TO public;',
	]);
});

test('add policy + link non-schema table from auth schema', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const authSchema = pgSchema('auth');

	const cities = authSchema.table('cities', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test2'),
		]),
		rls: pgPolicy('test', { as: 'permissive' }).link(cities),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test" ON "auth"."cities" AS PERMISSIVE FOR ALL TO public;',
	]);
});

test('rename policy that is linked', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('newName', { as: 'permissive' }).link(users),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'public.users.test->public.users.newName',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);
});

test('alter policy that is linked', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }).link(users),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
});

test('alter policy that is linked: withCheck', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (false);',
	]);
});

test('alter policy that is linked: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public USING (false);',
	]);
});

test('alter policy that is linked: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { for: 'delete' }).link(users),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (false);',
	]);
});

test('alter policy in the table: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public USING (false);',
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
});
