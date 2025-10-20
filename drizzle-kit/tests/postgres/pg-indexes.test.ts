import { and, eq, isNull, like, SQL, sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgRole,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	vector,
} from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase(false);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('adding basic indexes', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(t) => [
				index()
					.on(t.name.desc(), t.id.asc().nullsLast())
					.with({ fillfactor: 70 })
					.where(sql`name != 'alef'`),
				index('indx1')
					.using('hash', t.name)
					.with({ fillfactor: 70 }),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70) WHERE name != 'alef';`,
		`CREATE INDEX "indx1" ON "users" USING hash ("name") WITH (fillfactor=70);`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('dropping basic index', async () => {
	const schema1 = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(t) => [index().on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 })],
		),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [`DROP INDEX "users_name_id_index";`];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('altering indexes', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('removeColumn').on(t.name, t.id),
			index('addColumn').on(t.name.desc()).with({ fillfactor: 70 }),
			index('removeExpression').on(t.name.desc(), sql`name`).concurrently(),
			index('addExpression').on(t.id.desc()),
			index('changeExpression').on(t.id.desc(), sql`name`),
			index('changeName').on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }),
			index('changeWith').on(t.name).with({ fillfactor: 70 }),
			index('changeUsing').on(t.name),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('removeColumn').on(t.name),
			index('addColumn').on(t.name.desc(), t.id.nullsLast()).with({ fillfactor: 70 }),
			index('removeExpression').on(t.name.desc()).concurrently(),
			index('addExpression').on(t.id.desc()),
			index('changeExpression').on(t.id.desc(), sql`name desc`),
			index('newName').on(t.name.desc(), sql`name`).with({ fillfactor: 70 }),
			index('changeWith').on(t.name).with({ fillfactor: 90 }),
			index('changeUsing').using('hash', t.name),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		'DROP INDEX "changeExpression";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" ("name" DESC NULLS LAST);',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC NULLS LAST,name desc);',
		'CREATE INDEX "changeWith" ON "users" ("name") WITH (fillfactor=90);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "changeUsing";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "removeExpression";',
		'CREATE INDEX "newName" ON "users" ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
		'CREATE INDEX "changeWith" ON "users" ("name") WITH (fillfactor=90);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" ("name" DESC NULLS LAST);',
	]);
});

test('indexes test case #1', async () => {
	const schema1 = {
		users: pgTable(
			'users',
			{
				id: uuid('id').defaultRandom().primaryKey(),
				name: text('name').notNull(),
				description: text('description'),
				imageUrl: text('image_url'),
				inStock: boolean('in_stock').default(true),
			},
			(t) => [
				index().on(t.id.desc().nullsFirst()),
				index('indx1').on(t.id, t.imageUrl),
				index('indx4').on(t.id),
			],
		),
	};

	const schema2 = {
		users: pgTable(
			'users',
			{
				id: uuid('id').defaultRandom().primaryKey(),
				name: text('name').notNull(),
				description: text('description'),
				imageUrl: text('image_url'),
				inStock: boolean('in_stock').default(true),
			},
			(t) => [
				index().on(t.id.desc().nullsFirst()),
				index('indx1').on(t.id, t.imageUrl),
				index('indx4').on(t.id),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('Indexes properties that should not trigger push changes', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('changeExpression').on(t.id.desc(), sql`name`),
			index('indx1').on(t.name.desc()).concurrently(),
			index('indx2').on(t.name.desc()).where(sql`true`),
			index('indx3').on(t.name.op('text_ops')).where(sql`true`),
			index('indx4').on(sql`lower(name)`).where(sql`true`),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('changeExpression').on(t.id.desc(), sql`name desc`),
			index('indx1').on(t.name.desc()),
			index('indx2').on(t.name.desc()).where(sql`false`),
			index('indx3').on(t.name.op('test')).where(sql`true`),
			index('indx4').on(sql`lower(id)`).where(sql`true`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP INDEX "changeExpression";',
		'DROP INDEX "indx2";',
		'DROP INDEX "indx3";',
		'DROP INDEX "indx4";',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC NULLS LAST,name desc);',
		'CREATE INDEX "indx2" ON "users" ("name" DESC NULLS LAST) WHERE false;',
		'CREATE INDEX "indx3" ON "users" ("name" test);',
		'CREATE INDEX "indx4" ON "users" (lower(id));',
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX "indx2";',
		'CREATE INDEX "indx2" ON "users" ("name" DESC NULLS LAST) WHERE false;',
	]);
});

test('indexes #0', async (t) => {
	const schema1 = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(
				t,
			) => [
				index('removeColumn').on(t.name, t.id),
				index('addColumn').on(t.name.desc()).with({ fillfactor: 70 }),
				index('removeExpression').on(t.name.desc(), sql`name`).concurrently(),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name`),
				index('changeName').on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }),
				index('changeWith').on(t.name).with({ fillfactor: 70 }),
				index('changeUsing').on(t.name),
			],
		),
	};

	const schema2 = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(t) => [
				index('removeColumn').on(t.name),
				index('addColumn').on(t.name.desc(), t.id.nullsLast()).with({ fillfactor: 70 }),
				index('removeExpression').on(t.name.desc()).concurrently(),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name desc`),
				index('newName').on(t.name.desc(), sql`name`).with({ fillfactor: 70 }),
				index('changeWith').on(t.name).with({ fillfactor: 90 }),
				index('changeUsing').using('hash', t.name),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	expect(st).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		'DROP INDEX "changeExpression";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" ("name" DESC NULLS LAST);',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC NULLS LAST,name desc);',
		'CREATE INDEX "changeWith" ON "users" ("name") WITH (fillfactor=90);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
	]);

	// for push we ignore change of index expressions
	expect(pst).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "addColumn";',
		// 'DROP INDEX "changeExpression";',
		'DROP INDEX "changeUsing";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "removeExpression";',
		'CREATE INDEX "newName" ON "users" ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		// 'CREATE INDEX "changeExpression" ON "users" ("id" DESC NULLS LAST,name desc);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
		'CREATE INDEX "changeWith" ON "users" ("name") WITH (fillfactor=90);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" ("name" DESC NULLS LAST);',
	]);
});

test('vector index', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: vector('name', { dimensions: 3 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			embedding: vector('name', { dimensions: 3 }),
		}, (t) => [
			index('vector_embedding_idx')
				.using('hnsw', t.embedding.op('vector_ip_ops'))
				.with({ m: 16, ef_construction: 64 }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "vector_embedding_idx" ON "users" USING hnsw ("name" vector_ip_ops) WITH (m=16, ef_construction=64);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('index #2', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('indx').on(t.name.desc()).concurrently(),
			index('indx1').on(t.name.desc()),
			index('indx2').on(t.name.op('text_ops')),
			index('indx3').on(sql`lower(name)`),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('indx').on(t.name.desc()),
			index('indx1').on(t.name.desc()).where(sql`false`),
			index('indx2').on(t.name.op('test')),
			index('indx3').on(sql`lower(${t.name})`),
			index('indx4').on(sql`lower(name)`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP INDEX "indx1";',
		'DROP INDEX "indx2";',
		'DROP INDEX "indx3";',
		'CREATE INDEX "indx4" ON "users" (lower(name));',
		'CREATE INDEX "indx1" ON "users" ("name" DESC NULLS LAST) WHERE false;',
		'CREATE INDEX "indx2" ON "users" ("name" test);',
		'CREATE INDEX "indx3" ON "users" (lower("name"));',
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX "indx1";',
		// TODO: we ignore columns changes during 'push', we should probably tell user about it in CLI?
		// 'DROP INDEX "indx2";',
		// 'DROP INDEX "indx3";',
		'CREATE INDEX "indx4" ON "users" (lower(name));',
		'CREATE INDEX "indx1" ON "users" ("name" DESC NULLS LAST) WHERE false;',
		// 'CREATE INDEX "indx2" ON "users" ("name" test);',
		// 'CREATE INDEX "indx3" ON "users" (lower("name"));',
	]);
});

test('index #3', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index().on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }).where(sql`name != 'alex'`),
			index('indx1').using('hash', sql`${t.name}`).with({ fillfactor: 70 }),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70) WHERE name != 'alex';`,
		`CREATE INDEX "indx1" ON "users" USING hash ("name") WITH (fillfactor=70);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4929
test('index #4', async (t) => {
	const table1 = pgTable(
		'table',
		{
			uid: uuid('uid').notNull(),
			column1: timestamp('column1'),
			column2: timestamp('column2'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => and(isNull(table1.column1), isNull(table1.column2))!,
				)
				.notNull(),
		},
		(table) => [index('table_uid_bool_idx').on(table.uid, table.bool)],
	);
	const schema1 = { table: table1 };

	const table2 = pgTable(
		'table',
		{
			uid: uuid('uid').notNull(),
			column1: timestamp('column1'),
			column3: timestamp('column3'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => and(isNull(table2.column1), isNull(table2.column3))!,
				)
				.notNull(),
		},
		(table) => [index('table_uid_bool_idx').on(table.uid, table.bool)],
	);
	const schema2 = { table: table2 };

	const renames = ['public.table.column2->public.table.column3'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	expect(st).toStrictEqual([
		`ALTER TABLE \"table\" RENAME COLUMN \"column2\" TO \"column3\";`,
		`ALTER TABLE \"table\" DROP COLUMN \"bool\";`,
		`ALTER TABLE \"table\" ADD COLUMN \"bool\" boolean GENERATED ALWAYS AS ((\"table\".\"column1\" is null and \"table\".\"column3\" is null)) STORED;`,
		`CREATE INDEX "table_uid_bool_idx" ON "table" ("uid","bool");`,
	]);
	// push is not triggered on generated change
	expect(pst).toStrictEqual([
		`ALTER TABLE \"table\" RENAME COLUMN \"column2\" TO \"column3\";`,
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4790
test('index #5', async (t) => {
	const enum_ = pgEnum('enum', ['text', 'not_text']);
	const schema1 = {
		enum_,
		table1: pgTable('table1', {
			column1: integer(),
			column2: integer(),
			column3: integer(),
			column4: boolean(),
			column5: enum_(),
			column6: text(),
		}, (table) => [
			uniqueIndex().on(table.column1).where(eq(table.column4, true)),
			uniqueIndex().on(table.column2).where(eq(table.column5, 'text')),
			uniqueIndex().on(table.column3).where(like(table.column6, 'text')),
		]),
	};

	const { sqlStatements: st } = await diff({}, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0 = [
		`CREATE TYPE "enum" AS ENUM('text', 'not_text');`,
		'CREATE TABLE "table1" (\n'
		+ '\t"column1" integer,\n'
		+ '\t"column2" integer,\n'
		+ '\t"column3" integer,\n'
		+ '\t"column4" boolean,\n'
		+ '\t"column5" "enum",\n'
		+ '\t"column6" text\n'
		+ ');\n',
		'CREATE UNIQUE INDEX "table1_column1_index" ON "table1" ("column1") WHERE "table1"."column4" = true;', // or with $1 param instead of true, but then params must be included in the query
		`CREATE UNIQUE INDEX "table1_column2_index" ON "table1" ("column2") WHERE "table1"."column5" = 'text';`,
		`CREATE UNIQUE INDEX "table1_column3_index" ON "table1" ("column3") WHERE "table1"."column6" like 'text';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('index #6', async (t) => {
	const enum_ = pgEnum('enum', ['text', 'not_text', 'something_else']);
	const schema1 = {
		enum_,
		table1: pgTable('table1', {
			column1: integer(),
			column2: boolean(),
			column3: enum_(),
		}, (table) => [
			uniqueIndex().on(table.column1).where(eq(table.column2, true)),
			uniqueIndex().on(table.column1).where(eq(table.column3, 'text')),
		]),
	};

	const { sqlStatements: st } = await diff({}, schema1, []);
	console.log(st);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0 = [
		`CREATE TYPE "enum" AS ENUM('text', 'not_text');`,
		'CREATE TABLE "table1" (\n'
		+ '\t"column1" integer,\n'
		+ '\t"column2" boolean,\n'
		+ '\t"column3" "enum"\n'
		+ ');\n',
		'CREATE UNIQUE INDEX "table1_column1_index" ON "table1" ("column1") WHERE "table1"."column2" = true;', // or with $1 param instead of true, but then params must be included in the query
		`CREATE UNIQUE INDEX "table1_column1_index" ON "table1" ("column2") WHERE "table1"."column3" = 'text';`, // in indices names maybe should be some hash
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
