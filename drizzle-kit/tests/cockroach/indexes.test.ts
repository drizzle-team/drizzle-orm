import { sql } from 'drizzle-orm';
import { boolean, cockroachTable, index, int4, text, uuid } from 'drizzle-orm/cockroach-core';
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
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		'DROP INDEX "changeExpression";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
	]);

	// for push we ignore change of index expressions
	expect(pst).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "changeUsing";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "removeExpression";',
		// 'DROP INDEX "changeExpression";',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
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
		'DROP INDEX "indx2";',
		'DROP INDEX "indx4";',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'CREATE INDEX "indx2" ON "users" ("name" DESC) WHERE false;',
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
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		'DROP INDEX "changeExpression";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
		'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
	]);

	// for push we ignore change of index expressions
	expect(pst).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "changeUsing";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "removeExpression";',
		// 'DROP INDEX "changeExpression";',
		'CREATE INDEX "newName" ON "users" ("name" DESC,id);',
		'CREATE INDEX "addColumn" ON "users" ("name" DESC,"id");',
		// 'CREATE INDEX "changeExpression" ON "users" ("id" DESC,name desc);',
		'CREATE INDEX "changeUsing" ON "users" ("name") USING hash;',
		'CREATE INDEX "removeColumn" ON "users" ("name");',
		'CREATE INDEX "removeExpression" ON "users" ("name" DESC);',
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
		'DROP INDEX "indx3";',
		'CREATE INDEX "indx4" ON "users" (lower(name));',
		'CREATE INDEX "indx1" ON "users" ("name" DESC) WHERE false;',
		'CREATE INDEX "indx3" ON "users" (lower("name"));',
	]);
	expect(pst).toStrictEqual([
		'DROP INDEX "indx1";',
		// TODO: we ignore columns changes during 'push', we should probably tell user about it in CLI?
		// 'DROP INDEX "indx3";',
		'CREATE INDEX "indx4" ON "users" (lower(name));',
		'CREATE INDEX "indx1" ON "users" ("name" DESC) WHERE false;',
		// 'CREATE INDEX "indx3" ON "users" (lower("name"));',
	]);
});

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
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "users_name_id_index" ON "users" ("name" DESC,"id") WHERE name != 'alex';`,
		`CREATE INDEX "indx1" ON "users" ("name") USING hash;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
