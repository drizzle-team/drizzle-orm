import { sql } from 'drizzle-orm';
import { boolean, cockroachTable, index, int4, text, uniqueIndex, uuid } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('adding basic indexes', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				name: text('name'),
			},
			(t) => [
				index()
					.on(t.name, t.id.desc())
					.where(sql`name != 'alef'`),
				index('indx1').using('hash', t.name),
			],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name","id" DESC) WHERE name != 'alef';`,
		`CREATE INDEX "indx1" ON "users" ("name") USING hash;`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('dropping basic index', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				name: text('name'),
			},
			(t) => [index().on(t.name.desc(), t.id.asc())],
		),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
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

test.concurrent('altering indexes', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('removeColumn').on(t.name, t.id),
			index('addColumn').on(t.name.desc()),
			index('removeExpression').on(t.name.desc(), sql`id`),
			index('addExpression').on(t.id.desc()),
			index('changeExpression').on(t.id.desc(), sql`name`),
			index('changeName').on(t.name.desc(), t.id.asc()),
			index('changeUsing').on(t.name),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('removeColumn').on(t.name),
			index('addColumn').on(t.name.desc(), t.id.asc()),
			index('removeExpression').on(t.name.desc()),
			index('addExpression').on(t.id.desc()),
			index('changeExpression').on(t.id.desc(), sql`name desc`),
			index('newName').on(t.name.desc(), sql`id`),
			index('changeUsing').using('hash', t.name),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "removeColumn";',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'DROP INDEX "addColumn";',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'DROP INDEX "removeExpression";',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
		'DROP INDEX "changeExpression";',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
	]);

	// for push we ignore change of index expressions
	expect(pst).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "addColumn";',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
		'DROP INDEX "removeColumn";',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'DROP INDEX "removeExpression";',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
		// 'DROP INDEX "changeExpression";',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
		// 'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
	]);
});

test.concurrent('indexes test case #1', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable(
			'users',
			{
				id: uuid('id').defaultRandom().primaryKey(),
				name: text('name').notNull(),
				description: text('description'),
				imageUrl: text('image_url'),
				inStock: boolean('in_stock').default(true),
			},
			(t) => [
				index().on(t.id.desc()),
				index('indx1').on(t.id, t.imageUrl),
				index('indx4').on(t.id),
			],
		),
	};

	const schema2 = {
		users: cockroachTable(
			'users',
			{
				id: uuid('id').defaultRandom().primaryKey(),
				name: text('name').notNull(),
				description: text('description'),
				imageUrl: text('image_url'),
				inStock: boolean('in_stock').default(true),
			},
			(t) => [
				index().on(t.id.desc()),
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

test.concurrent('Indexes properties that should not trigger push changes', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('changeExpression').on(t.id.desc(), sql`name`),
			index('indx1').on(t.name.desc()),
			index('indx2').on(t.name.desc()).where(sql`true`),
			index('indx4').on(sql`lower(name)`).where(sql`true`),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('changeExpression').on(t.id.desc(), sql`name desc`),
			index('indx1').on(t.name.desc()),
			index('indx2').on(t.name.desc()).where(sql`false`),
			index('indx4').on(sql`lower(id)`).where(sql`true`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP INDEX "changeExpression";',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'DROP INDEX "indx2";',
		'CREATE INDEX "indx2" ON "users" ("name" DESC) WHERE false;',
		'DROP INDEX "indx4";',
		'CREATE INDEX "indx4" ON "users" (lower(id));',
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX "indx2";',
		'CREATE INDEX "indx2" ON "users" ("name" DESC) WHERE false;',
	]);
});

test.concurrent('indexes #0', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				name: text('name'),
			},
			(
				t,
			) => [
				index('removeColumn').on(t.name, t.id),
				index('addColumn').on(t.name.desc()),
				index('removeExpression').on(t.name.desc(), sql`id`),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name`),
				index('changeName').on(t.name.desc(), t.id.asc()),
				index('changeUsing').on(t.name),
			],
		),
	};

	const schema2 = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				name: text('name'),
			},
			(t) => [
				index('removeColumn').on(t.name),
				index('addColumn').on(t.name.desc(), t.id),
				index('removeExpression').on(t.name.desc()),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name desc`),
				index('newName').on(t.name.desc(), sql`id`),
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
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'DROP INDEX "addColumn";',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'DROP INDEX "removeExpression";',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
		'DROP INDEX "changeExpression";',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
	]);

	// for push we ignore change of index expressions
	expect(pst).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "addColumn";',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
		'DROP INDEX "removeColumn";',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'DROP INDEX "removeExpression";',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
		// 'DROP INDEX "changeExpression";',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
		// 'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
	]);
});

test.concurrent('index #2', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('indx').on(t.name.desc()),
			index('indx1').on(t.name.desc()),
			index('indx3').on(sql`lower(name)`),
		]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index('indx').on(t.name.desc()),
			index('indx1').on(t.name.desc()).where(sql`false`),
			index('indx3').on(sql`lower(${t.name})`),
			index('indx4').on(sql`lower(name)`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP INDEX "indx1";',
		'CREATE INDEX "indx1" ON "users" ("name" DESC) WHERE false;',
		'DROP INDEX "indx3";',
		'CREATE INDEX "indx3" ON "users" (lower("name"));',
		'CREATE INDEX "indx4" ON "users" (lower(name));',
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX "indx1";',
		// TODO: we ignore columns changes during 'push', we should probably tell user about it in CLI?
		// 'DROP INDEX "indx3";',
		'CREATE INDEX "indx1" ON "users" ("name" DESC) WHERE false;',
		'CREATE INDEX "indx4" ON "users" (lower(name));',
		// 'CREATE INDEX "indx3" ON "users" (lower("name"));',
	]);
});

/**
There are two similar tests shown here
When creating an index with the sql`name != 'alex'`, Cockroach automatically adds 'alex'::STRING
Since this behavior comes directly from the sql`` we can't handle it

The second test passes because it explicitly add ::STRING
We should provide some kind of hint or suggestion to inform the user about this
 */
test.concurrent('index #3', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index().on(t.name.desc(), t.id.asc()).where(sql`name != 'alex'`),
			index('indx1').using('hash', sql`${t.name}`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, ignoreSubsequent: true });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name" DESC,"id") WHERE name != 'alex';`,
		`CREATE INDEX "indx1" ON "users" ("name") USING hash;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test.concurrent('index #3_1', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}, (t) => [
			index().on(t.name.desc(), t.id.asc()).where(sql`name != 'alex'::STRING`),
			index('indx1').using('hash', sql`${t.name}`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name" DESC,"id") WHERE name != 'alex'::STRING;`,
		`CREATE INDEX "indx1" ON "users" ("name") USING hash;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3255
test('index #4', async ({ dbc: db }) => {
	const table1 = cockroachTable('table1', {
		col1: int4(),
		col2: int4(),
	}, () => [
		index1,
		index2,
		index3,
		index4,
		index5,
		index6,
	]);

	const index1 = uniqueIndex('index1').on(table1.col1);
	const index2 = uniqueIndex('index2').on(table1.col1, table1.col2);
	const index3 = index('index3').on(table1.col1);
	const index4 = index('index4').on(table1.col1, table1.col2);
	const index5 = index('index5').on(sql`${table1.col1} asc`);
	const index6 = index('index6').on(sql`${table1.col1} asc`, sql`${table1.col2} desc`);

	const schema1 = { table1 };

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt1 = [
		'CREATE TABLE "table1" (\n'
		+ '\t"col1" int4,\n'
		+ '\t"col2" int4,\n'
		+ '\tCONSTRAINT "index1" UNIQUE("col1"),\n'
		+ '\tCONSTRAINT "index2" UNIQUE("col1","col2")\n'
		+ ');\n',
		'CREATE INDEX "index3" ON "table1" ("col1");',
		'CREATE INDEX "index4" ON "table1" ("col1","col2");',
		'CREATE INDEX "index5" ON "table1" ("col1" asc);',
		'CREATE INDEX "index6" ON "table1" ("col1" asc,"col2" desc);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});
