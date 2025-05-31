// test cases

import { SQL, sql } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
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
				`\"users\".\"name\" || 'hello'`,
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
				.generatedAlwaysAs(`\"users\".\"name\" || 'to add'`),
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
				`\"users\".\"name\" || 'to delete'`,
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
				`\"users\".\"name\" || 'hello'`,
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
