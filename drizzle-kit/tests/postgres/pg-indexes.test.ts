import { sql } from 'drizzle-orm';
import { boolean, index, pgRole, pgTable, serial, text, uuid, vector } from 'drizzle-orm/pg-core';
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
					.where(sql`select 1`),
				index('indx1')
					.using('hash', t.name.desc(), sql`${t.name}`)
					.with({ fillfactor: 70 }),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70) WHERE select 1;`,
		`CREATE INDEX "indx1" ON "users" USING hash ("name" DESC NULLS LAST,"name") WITH (fillfactor=70);`,
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

	const st0 = [
		'DROP INDEX "changeName";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" ("name" DESC NULLS LAST);',
		'CREATE INDEX "changeWith" ON "users" ("name") WITH (fillfactor=90);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
			index('indx').on(t.name.desc()).concurrently(),
			index('indx1').on(t.name.desc()).where(sql`true`),
			index('indx2').on(t.name.op('text_ops')).where(sql`true`),
			index('indx3').on(sql`lower(name)`).where(sql`true`),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('changeExpression').on(t.id.desc(), sql`name desc`),
			index('indx').on(t.name.desc()),
			index('indx1').on(t.name.desc()).where(sql`false`),
			index('indx2').on(t.name.op('test')).where(sql`true`),
			index('indx3').on(sql`lower(id)`).where(sql`true`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'DROP INDEX "indx1";',
		'CREATE INDEX "indx1" ON "users" ("name" DESC NULLS LAST) WHERE false;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		'DROP INDEX "removeColumn";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		// 'DROP INDEX "changeExpression";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" ("name" DESC NULLS LAST);',
		// 'CREATE INDEX "changeExpression" ON "users" ("id" DESC NULLS LAST,name desc);',
		'CREATE INDEX "changeWith" ON "users" ("name") WITH (fillfactor=90);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
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
