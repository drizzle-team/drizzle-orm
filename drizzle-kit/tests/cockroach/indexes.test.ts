import { isNotNull, sql } from 'drizzle-orm';
import {
	boolean,
	cockroachSchema,
	cockroachTable,
	index,
	IndexBuilder,
	int4,
	primaryKey,
	text,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/cockroach-core';
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

// https://github.com/drizzle-team/drizzle-orm/issues/5593
test('indexes #5', async ({ dbc: db }) => {
	const schema = cockroachSchema('my_schema');
	const table1 = schema.table('table1', {
		col1: int4(),
		col2: int4(),
	}, (t) => [
		uniqueIndex('index1').on(t.col1).where(isNotNull(t.col1)),
		index('index2').on(t.col1).where(isNotNull(t.col1)),
	]);

	const schema1 = { schema, table1 };

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt1 = [
		'CREATE SCHEMA "my_schema";\n',
		'CREATE TABLE "my_schema"."table1" (\n'
		+ '\t"col1" int4,\n'
		+ '\t"col2" int4\n'
		+ ');\n',
		'CREATE UNIQUE INDEX "index1" ON "my_schema"."table1" ("col1") WHERE ("my_schema"."table1"."col1" is not null);',
		'CREATE INDEX "index2" ON "my_schema"."table1" ("col1") WHERE ("my_schema"."table1"."col1" is not null);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});

// The `renames` below swap the index names, so both tables have an index `second_idx` after the first rename.
// Cockroach refuses that name as ambiguous, so the second rename names the table `dogs`.
const folder = cockroachSchema('folder');

test.concurrent.for([
	{ name: 'the public schema', schema: 'public', prefix: '' },
	{ name: 'another schema', schema: 'folder', prefix: '"folder".' },
])(
	'index renames that swap a name between two tables of $name keep the changes of both indexes',
	async ({ schema, prefix }, { db }) => {
		const table = (schema === 'folder' ? folder.table : cockroachTable) as typeof cockroachTable;
		const tables = (catsIndex: string, dogsIndex: string, hasSecondColumn: boolean) => {
			const on = (name: string) => (t: any) => [hasSecondColumn ? index(name).on(t.id, t.name) : index(name).on(t.id)];
			return {
				folder,
				cats: table('cats', { id: int4(), name: text() }, on(catsIndex)),
				dogs: table('dogs', { id: int4(), name: text() }, on(dogsIndex)),
			};
		};
		const renames = [
			`${schema}.cats.first_idx->${schema}.cats.second_idx`,
			`${schema}.dogs.second_idx->${schema}.dogs.first_idx`,
		];
		const from = tables('first_idx', 'second_idx', false);
		const to = tables('second_idx', 'first_idx', true);

		const { sqlStatements: st } = await diff(from, to, renames);
		await push({ db, to: from });
		const { sqlStatements: pst } = await push({ db, to, renames });

		const st0 = [
			`ALTER INDEX ${prefix}"first_idx" RENAME TO "second_idx";`,
			`ALTER INDEX ${prefix}"dogs"@"second_idx" RENAME TO "first_idx";`,
			`DROP INDEX ${prefix}"second_idx";`,
			`CREATE INDEX "second_idx" ON ${prefix}"cats" ("id","name");`,
			`DROP INDEX ${prefix}"first_idx";`,
			`CREATE INDEX "first_idx" ON ${prefix}"dogs" ("id","name");`,
		];
		expect(st).toStrictEqual(st0);
		expect(pst).toStrictEqual(st0);
	},
);

test.concurrent.for([
	{ name: 'an index', create: index, drop: 'DROP INDEX "cats"@"name_idx";' },
	{ name: 'a unique index', create: uniqueIndex, drop: 'DROP INDEX "cats"@"name_idx" CASCADE;' },
])(
	'a drop of $name whose name an index of another table takes writes SQL that runs',
	async ({ create, drop }, { db }) => {
		const columns = { id: int4() };
		const from = {
			cats: cockroachTable('cats', columns, (t) => [create('name_idx').on(t.id)]),
			dogs: cockroachTable('dogs', columns, (t) => [index('other_idx').on(t.id)]),
		};
		const to = {
			cats: cockroachTable('cats', columns),
			dogs: cockroachTable('dogs', columns, (t) => [index('name_idx').on(t.id)]),
		};
		const renames = ['public.dogs.other_idx->public.dogs.name_idx'];

		const { sqlStatements: st } = await diff(from, to, renames);
		await push({ db, to: from });
		const { sqlStatements: pst } = await push({ db, to, renames });

		const st0 = ['ALTER INDEX "other_idx" RENAME TO "name_idx";', drop];
		expect(st).toStrictEqual(st0);
		expect(pst).toStrictEqual(st0);
	},
);

test.concurrent('a rename of a unique index whose name a new table takes writes SQL that runs', async ({ db }) => {
	const columns = { id: int4() };
	const from = { cats: cockroachTable('cats', columns, (t) => [uniqueIndex('name_idx').on(t.id)]) };
	const to = {
		cats: cockroachTable('cats', columns, (t) => [uniqueIndex('other_idx').on(t.id)]),
		dogs: cockroachTable('dogs', columns, (t) => [uniqueIndex('name_idx').on(t.id)]),
	};
	const renames = ['public.cats.name_idx->public.cats.other_idx'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'CREATE TABLE "dogs" (\n\t"id" int4,\n\tCONSTRAINT "name_idx" UNIQUE("id")\n);\n',
		'ALTER INDEX "cats"@"name_idx" RENAME TO "other_idx";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// In cockroach the primary key `x` of `dogs` owns an index with the name `x`.
// So `ALTER INDEX "x"` is ambiguous, and the rename must name the table `cats`.
test.concurrent('an index rename names its table when the primary key of another table has the name', async ({ db }) => {
	const dogs = cockroachTable('dogs', { id: int4() }, (t) => [primaryKey({ name: 'x', columns: [t.id] })]);
	const cats = (name: string) => cockroachTable('cats', { id: int4() }, (t) => [index(name).on(t.id)]);
	const renames = ['public.cats.x->public.cats.y'];

	const { sqlStatements: st } = await diff({ dogs, cats: cats('x') }, { dogs, cats: cats('y') }, renames);
	await push({ db, to: { dogs, cats: cats('x') } });
	const { sqlStatements: pst } = await push({ db, to: { dogs, cats: cats('y') }, renames });

	const st0 = ['ALTER INDEX "cats"@"x" RENAME TO "y";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
