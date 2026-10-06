// test cases

import { SQL, sql } from 'drizzle-orm';
import { foreignKey, index, integer, pgEnum, pgTable, text, unique, varchar } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, PostgresSchema, prepareTestDatabase, push, TestDatabase } from './mocks';

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

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add generated constraint to an exisiting column', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: drop generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE \"users\" ALTER COLUMN \"gen_name\" DROP EXPRESSION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: change generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we don't trigger generated column recreate if definition change within push
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add generated constraint to an exisiting column', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\"users\".\"name\" || 'to add'`),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: drop generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'to delete'`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE \"users\" ALTER COLUMN \"gen_name\" DROP EXPRESSION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\"`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we don't trigger generated column recreate if definition change within push
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add generated constraint to an exisiting column', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\"users\".\"name\" || 'to add'`),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: drop generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'to delete'`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE \"users\" ALTER COLUMN \"gen_name\" DROP EXPRESSION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we don't trigger generated column recreate if definition change within push
});

// https://github.com/drizzle-team/drizzle-orm/issues/4622
test('generated as string: enum column', async () => {
	const roleEnum = pgEnum('role-enum', ['admin', 'manager']);
	const to = {
		roleEnum,
		users: pgTable('users', {
			role: roleEnum('gen_name').generatedAlwaysAs(sql`'admin'`),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TYPE "role-enum" AS ENUM('admin', 'manager');`,
		'CREATE TABLE "users" (\n'
		+ `\t"gen_name" "role-enum" GENERATED ALWAYS AS ('admin') STORED\n`
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter generated constraint', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
		}),
	};
	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push ignores definition changes
});

test('a new expression of a generated column keeps the foreign key of the column', async () => {
	const owners = pgTable('owners', { id: integer().primaryKey() });
	const cats = (expression: SQL) =>
		pgTable('cats', {
			id: integer(),
			ownerId: integer().generatedAlwaysAs(expression).references(() => owners.id),
		});
	const from = { owners, cats: cats(sql`"id" + 1`) };
	const to = { owners, cats: cats(sql`"id" + 2`) };

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	// push does not compare the expression of a generated column, so the SQL of generate runs here.
	for (const statement of st) await db.query(statement);

	expect(st).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_ownerId_owners_id_fkey";',
		'ALTER TABLE "cats" DROP COLUMN "ownerId";',
		'ALTER TABLE "cats" ADD COLUMN "ownerId" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_ownerId_owners_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id");',
	]);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);
});

// push does not compare the expression of a generated column, so the SQL of generate runs here.
const generateAndRun = async (from: PostgresSchema, to: PostgresSchema, renames: string[] = []) => {
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	for (const statement of sqlStatements) await db.query(statement);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);
	return sqlStatements;
};

test('a new expression of a generated column with a new foreign key creates the foreign key one time', async () => {
	const owners = pgTable('owners', { id: integer().primaryKey() });
	const from = {
		owners,
		cats: pgTable('cats', { id: integer(), ownerId: integer().generatedAlwaysAs(sql`"id" + 1`) }),
	};
	const to = {
		owners,
		cats: pgTable('cats', {
			id: integer(),
			ownerId: integer().generatedAlwaysAs(sql`"id" + 2`).references(() => owners.id),
		}),
	};

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP COLUMN "ownerId";',
		'ALTER TABLE "cats" ADD COLUMN "ownerId" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_ownerId_owners_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id");',
	]);
});

test('a column that becomes generated with a renamed foreign key drops the foreign key with its old name', async () => {
	const owners = pgTable('owners', { id: integer().primaryKey() });
	const from = {
		owners,
		cats: pgTable('cats', { id: integer(), ownerId: integer() }, (t) => [
			foreignKey({ name: 'fk_old', columns: [t.ownerId], foreignColumns: [owners.id] }),
		]),
	};
	const to = {
		owners,
		cats: pgTable('cats', { id: integer(), ownerId: integer().generatedAlwaysAs(sql`"id" + 2`) }, (t) => [
			foreignKey({ name: 'fk_new', columns: [t.ownerId], foreignColumns: [owners.id] }),
		]),
	};
	const renames = ['public.cats.fk_old->public.cats.fk_new'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'ALTER TABLE "cats" DROP CONSTRAINT "fk_old";',
		'ALTER TABLE "cats" DROP COLUMN "ownerId";',
		'ALTER TABLE "cats" ADD COLUMN "ownerId" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "fk_new" FOREIGN KEY ("ownerId") REFERENCES "owners"("id");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('a new expression of a generated column with a foreign key from a new table creates the foreign key one time', async () => {
	const owners = (expression: SQL) =>
		pgTable('owners', { id: integer(), code: integer().generatedAlwaysAs(expression).unique() });
	const ownersFrom = owners(sql`"id" + 1`);
	const ownersTo = owners(sql`"id" + 2`);
	const from = { owners: ownersFrom };
	const to = { owners: ownersTo, cats: pgTable('cats', { ownerCode: integer().references(() => ownersTo.code) }) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'CREATE TABLE "cats" (\n\t"ownerCode" integer\n);\n',
		'ALTER TABLE "owners" DROP COLUMN "code";',
		'ALTER TABLE "owners" ADD COLUMN "code" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "owners" ADD CONSTRAINT "owners_code_key" UNIQUE("code");',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_ownerCode_owners_code_fkey" FOREIGN KEY ("ownerCode") REFERENCES "owners"("code");',
	]);
});

test('a new expression of two generated columns of one foreign key drops and creates the foreign key one time', async () => {
	const owners = pgTable('owners', { a: integer(), b: integer() }, (t) => [unique().on(t.a, t.b)]);
	const cats = (expression: SQL) =>
		pgTable('cats', {
			id: integer(),
			a: integer().generatedAlwaysAs(expression),
			b: integer().generatedAlwaysAs(expression),
		}, (t) => [foreignKey({ name: 'cats_owner_fkey', columns: [t.a, t.b], foreignColumns: [owners.a, owners.b] })]);
	const from = { owners, cats: cats(sql`"id" + 1`) };
	const to = { owners, cats: cats(sql`"id" + 2`) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_owner_fkey";',
		'ALTER TABLE "cats" DROP COLUMN "a";',
		'ALTER TABLE "cats" ADD COLUMN "a" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" DROP COLUMN "b";',
		'ALTER TABLE "cats" ADD COLUMN "b" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_owner_fkey" FOREIGN KEY ("a","b") REFERENCES "owners"("a","b");',
	]);
});

test('a new expression of a generated column with a foreign key to itself drops and creates the foreign key one time', async () => {
	const cats = (expression: SQL) =>
		pgTable('cats', { id: integer(), code: integer().generatedAlwaysAs(expression).unique() }, (t) => [
			foreignKey({ name: 'cats_code_fkey', columns: [t.code], foreignColumns: [t.code] }),
		]);
	const from = { cats: cats(sql`"id" + 1`) };
	const to = { cats: cats(sql`"id" + 2`) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_code_fkey";',
		'ALTER TABLE "cats" DROP COLUMN "code";',
		'ALTER TABLE "cats" ADD COLUMN "code" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_code_key" UNIQUE("code");',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_code_fkey" FOREIGN KEY ("code") REFERENCES "cats"("code");',
	]);
});

// The dropped key is not in the new state, so only its own drop statement names it.
test('a new expression of a generated column with a dropped foreign key drops the foreign key one time', async () => {
	const owners = pgTable('owners', { id: integer().primaryKey() });
	const from = {
		owners,
		cats: pgTable('cats', {
			id: integer(),
			ownerId: integer().generatedAlwaysAs(sql`"id" + 1`).references(() => owners.id),
		}),
	};
	const to = { owners, cats: pgTable('cats', { id: integer(), ownerId: integer().generatedAlwaysAs(sql`"id" + 2`) }) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_ownerId_owners_id_fkey";',
		'ALTER TABLE "cats" DROP COLUMN "ownerId";',
		'ALTER TABLE "cats" ADD COLUMN "ownerId" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
	]);
});

// The diff writes the changed key two times: its create statement after the column, and its recreate statement.
test('a new expression of a generated column with a new action of its foreign key writes SQL that runs', async () => {
	const owners = pgTable('owners', { id: integer().primaryKey() });
	const cats = (expression: SQL, onDelete: 'no action' | 'cascade') =>
		pgTable('cats', {
			id: integer(),
			ownerId: integer().generatedAlwaysAs(expression).references(() => owners.id, { onDelete }),
		});
	const from = { owners, cats: cats(sql`"id" + 1`, 'no action') };
	const to = { owners, cats: cats(sql`"id" + 2`, 'cascade') };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_ownerId_owners_id_fkey";',
		'ALTER TABLE "cats" DROP COLUMN "ownerId";',
		'ALTER TABLE "cats" ADD COLUMN "ownerId" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_ownerId_owners_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE;',
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_ownerId_owners_id_fkey", ADD CONSTRAINT "cats_ownerId_owners_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE;',
	]);
});

// The key is in both states, so it gets one drop before the column and one create after it.
test('a new expression of a generated column keeps a foreign key that references the column', async () => {
	const owners = (expression: SQL) =>
		pgTable('owners', { id: integer(), code: integer().generatedAlwaysAs(expression).unique() });
	const cats = (table: ReturnType<typeof owners>) =>
		pgTable('cats', { ownerCode: integer().references(() => table.code) });
	const ownersFrom = owners(sql`"id" + 1`);
	const ownersTo = owners(sql`"id" + 2`);
	const from = { owners: ownersFrom, cats: cats(ownersFrom) };
	const to = { owners: ownersTo, cats: cats(ownersTo) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_ownerCode_owners_code_fkey";',
		'ALTER TABLE "owners" DROP COLUMN "code";',
		'ALTER TABLE "owners" ADD COLUMN "code" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "owners" ADD CONSTRAINT "owners_code_key" UNIQUE("code");',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_ownerCode_owners_code_fkey" FOREIGN KEY ("ownerCode") REFERENCES "owners"("code");',
	]);
});

test('a new expression of two generated columns keeps the unique constraint and the foreign key that references the columns', async () => {
	const owners = (expression: SQL) =>
		pgTable('owners', {
			id: integer(),
			a: integer().generatedAlwaysAs(expression),
			b: integer().generatedAlwaysAs(expression),
		}, (t) => [unique('owners_a_b_key').on(t.a, t.b)]);
	const cats = (table: ReturnType<typeof owners>) =>
		pgTable('cats', { a: integer(), b: integer() }, (t) => [
			foreignKey({ name: 'cats_owner_fkey', columns: [t.a, t.b], foreignColumns: [table.a, table.b] }),
		]);
	const ownersFrom = owners(sql`"id" + 1`);
	const ownersTo = owners(sql`"id" + 2`);
	const from = { owners: ownersFrom, cats: cats(ownersFrom) };
	const to = { owners: ownersTo, cats: cats(ownersTo) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP CONSTRAINT "cats_owner_fkey";',
		'ALTER TABLE "owners" DROP COLUMN "a";',
		'ALTER TABLE "owners" ADD COLUMN "a" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "owners" DROP COLUMN "b";',
		'ALTER TABLE "owners" ADD COLUMN "b" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "owners" ADD CONSTRAINT "owners_a_b_key" UNIQUE("a","b");',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_owner_fkey" FOREIGN KEY ("a","b") REFERENCES "owners"("a","b");',
	]);
});

test('a new expression of a generated column with a new unique constraint adds the constraint one time', async () => {
	const from = { cats: pgTable('cats', { id: integer(), code: integer().generatedAlwaysAs(sql`"id" + 1`) }) };
	const to = {
		cats: pgTable('cats', { id: integer(), code: integer().generatedAlwaysAs(sql`"id" + 2`).unique() }),
	};

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP COLUMN "code";',
		'ALTER TABLE "cats" ADD COLUMN "code" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" ADD CONSTRAINT "cats_code_key" UNIQUE("code");',
	]);
});

test('a new expression of a generated column with a new index creates the index one time', async () => {
	const from = { cats: pgTable('cats', { id: integer(), code: integer().generatedAlwaysAs(sql`"id" + 1`) }) };
	const to = {
		cats: pgTable('cats', { id: integer(), code: integer().generatedAlwaysAs(sql`"id" + 2`) }, (t) => [
			index('cats_code_idx').on(t.code),
		]),
	};

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP COLUMN "code";',
		'ALTER TABLE "cats" ADD COLUMN "code" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'CREATE INDEX "cats_code_idx" ON "cats" ("code");',
	]);
});

test('a new expression of two generated columns of one index creates the index one time', async () => {
	const cats = (expression: SQL) =>
		pgTable('cats', {
			id: integer(),
			a: integer().generatedAlwaysAs(expression),
			b: integer().generatedAlwaysAs(expression),
		}, (t) => [index('cats_a_b_idx').on(t.a, t.b)]);
	const from = { cats: cats(sql`"id" + 1`) };
	const to = { cats: cats(sql`"id" + 2`) };

	expect(await generateAndRun(from, to)).toStrictEqual([
		'ALTER TABLE "cats" DROP COLUMN "a";',
		'ALTER TABLE "cats" ADD COLUMN "a" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'ALTER TABLE "cats" DROP COLUMN "b";',
		'ALTER TABLE "cats" ADD COLUMN "b" integer GENERATED ALWAYS AS ("id" + 2) STORED;',
		'CREATE INDEX "cats_a_b_idx" ON "cats" ("a","b");',
	]);
});

// Postgres refuses a USING clause in a type change of a generated column.
test.each([
	{
		name: 'a generated array column that gets a second dimension',
		from: text().array().generatedAlwaysAs(sql`ARRAY["name"]`),
		to: text().array('[][]').generatedAlwaysAs(sql`ARRAY["name"]`),
		expected: ['ALTER TABLE "users" ALTER COLUMN "tags" SET DATA TYPE text[][];'],
	},
	{
		name: 'a generated column that becomes a plain column of another type',
		from: text().generatedAlwaysAs(sql`"name"`),
		to: varchar(),
		expected: [
			'ALTER TABLE "users" ALTER COLUMN "tags" DROP EXPRESSION;',
			'ALTER TABLE "users" ALTER COLUMN "tags" SET DATA TYPE varchar USING "tags"::varchar;',
		],
	},
])('$name gets a type change that runs', async ({ from, to, expected }) => {
	const before = { users: pgTable('users', { name: text(), tags: from }) };
	const after = { users: pgTable('users', { name: text(), tags: to }) };

	const { sqlStatements: st } = await diff(before, after, []);
	await push({ db, to: before });
	// push writes nothing for a generated column when the database prints its expression in another form,
	// so the SQL of generate runs here.
	for (const statement of st) await db.query(statement);

	expect(st).toStrictEqual(expected);
	expect((await push({ db, to: after })).sqlStatements).toStrictEqual([]);
});
