import { sql } from 'drizzle-orm';
import { index, integer, pgSchema, pgSequence, primaryKey } from 'drizzle-orm/pg-core';
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

test('create sequence', async () => {
	const to = {
		seq: pgSequence('name', { startWith: 100 }),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE SEQUENCE "public"."name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create sequence: all fields', async () => {
	const from = {};
	const to = {
		seq: pgSequence('name', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE SEQUENCE "public"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create sequence: custom schema', async () => {
	const customSchema = pgSchema('custom');
	const from = { customSchema };
	const to = {
		customSchema,
		seq: customSchema.sequence('name', { startWith: 100 }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'CREATE SEQUENCE "custom"."name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create sequence: custom schema + all fields', async () => {
	const customSchema = pgSchema('custom');
	const from = { customSchema };
	const to = {
		customSchema,
		seq: customSchema.sequence('name', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'CREATE SEQUENCE "custom"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = {};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'DROP SEQUENCE "public"."name";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop sequence: custom schema', async () => {
	const customSchema = pgSchema('custom');
	const from = { customSchema, seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { customSchema };

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'DROP SEQUENCE "custom"."name";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// rename sequence

test('rename sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name_new', { startWith: 100 }) };

	const renames = [
		'public.name->public.name_new',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SEQUENCE "name" RENAME TO "name_new";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename sequence in custom schema', async () => {
	const customSchema = pgSchema('custom');

	const from = { customSchema, seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { customSchema, seq: customSchema.sequence('name_new', { startWith: 100 }) };

	const renames = [
		'custom.name->custom.name_new',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SEQUENCE "custom"."name" RENAME TO "name_new";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('move sequence between schemas #1', async () => {
	const customSchema = pgSchema('custom');
	const from = { customSchema, seq: pgSequence('name', { startWith: 100 }) };
	const to = { customSchema, seq: customSchema.sequence('name', { startWith: 100 }) };

	const renames = [
		'public.name->custom.name',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SEQUENCE "name" SET SCHEMA "custom";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('move sequence between schemas #2', async () => {
	const customSchema = pgSchema('custom');
	const from = { customSchema, seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { customSchema, seq: pgSequence('name', { startWith: 100 }) };

	const renames = [
		'custom.name->public.name',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SEQUENCE "custom"."name" SET SCHEMA "public";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('a sequence that moves to another schema with a new name and new fields writes SQL that runs', async () => {
	const customSchema = pgSchema('custom');
	const from = { customSchema, seq: pgSequence('name', { startWith: 100, increment: 2 }) };
	const to = { customSchema, seq: customSchema.sequence('name_new', { startWith: 100, increment: 4 }) };
	const renames = ['public.name->custom.name_new'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'ALTER SEQUENCE "name" SET SCHEMA "custom";',
		'ALTER SEQUENCE "custom"."name" RENAME TO "name_new";',
		'ALTER SEQUENCE "custom"."name_new" INCREMENT BY 4 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);
});

// Tables, views, sequences and indexes of one schema share one namespace. The sequence cannot move first
// here, so it gets its new name in its old schema.
const folder = pgSchema('folder');
const renamedThenMoved = ['ALTER SEQUENCE "s" RENAME TO "s2";', 'ALTER SEQUENCE "s2" SET SCHEMA "folder";'];
const sameName = {
	sequence: folder.sequence('s'),
	table: folder.table('s', { id: integer() }),
	view: folder.view('s', { id: integer() }).as(sql`SELECT 1 AS "id"`),
	index: folder.table('cats', { id: integer() }, (t) => [index('s').on(t.id)]),
	primaryKey: folder.table('cats', { id: integer() }, (t) => [primaryKey({ name: 's', columns: [t.id] })]),
};
test.each([
	{ name: 'a sequence that stays', old: sameName.sequence, kept: sameName.sequence, sql: renamedThenMoved },
	{
		name: 'a new sequence',
		old: undefined,
		kept: sameName.sequence,
		sql: [
			'CREATE SEQUENCE "folder"."s" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;',
			...renamedThenMoved,
		],
	},
	{
		name: 'a dropped sequence',
		old: sameName.sequence,
		kept: undefined,
		sql: [...renamedThenMoved, 'DROP SEQUENCE "folder"."s";'],
	},
	{ name: 'a table', old: sameName.table, kept: sameName.table, sql: renamedThenMoved },
	{ name: 'a view', old: sameName.view, kept: sameName.view, sql: renamedThenMoved },
	{ name: 'an index', old: sameName.index, kept: sameName.index, sql: renamedThenMoved },
	{ name: 'a primary key', old: sameName.primaryKey, kept: sameName.primaryKey, sql: renamedThenMoved },
])(
	'a sequence move with a new name into a schema where $name has its old name writes SQL that runs',
	async ({ old, kept, sql }) => {
		const from = { folder, seq: pgSequence('s'), ...(old ? { old } : {}) };
		const to = { folder, seq: folder.sequence('s2'), ...(kept ? { kept } : {}) };
		const renames = ['public.s->folder.s2'];

		const { sqlStatements: st } = await diff(from, to, renames);
		await push({ db, to: from });
		const { sqlStatements: pst } = await push({ db, to, renames });

		expect(st).toStrictEqual(sql);
		expect(pst).toStrictEqual(sql);
	},
);

// The table is created after the sequence statements, so the old name of the sequence is still free.
test('a sequence move with a new name into a schema that gets a table with its old name writes SQL that runs', async () => {
	const from = { folder, seq: pgSequence('s') };
	const to = { folder, seq: folder.sequence('s2'), kept: sameName.table };
	const renames = ['public.s->folder.s2'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'ALTER SEQUENCE "s" SET SCHEMA "folder";',
		'ALTER SEQUENCE "folder"."s" RENAME TO "s2";',
		'CREATE TABLE "folder"."s" (\n\t"id" integer\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// Add squasher for sequences to make alters work +
// Run all tests +
// Finish introspect for sequences +
// Check push for sequences +

// add tests for generated to postgresql +
// add tests for generated to mysql +
// add tests for generated to sqlite +

// add tests for identity to postgresql

// check introspect generated(all dialects) +
// check push generated(all dialect) +

// add introspect ts file logic for all the features
// manually test everything
// beta release

test('alter sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name', { startWith: 105 }) };

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER SEQUENCE "name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 105 CACHE 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('full sequence: no changes', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('basic sequence: change fields', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 100000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 4,
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER SEQUENCE "my_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 100000 START WITH 100 CACHE 10 CYCLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('basic sequence: change name', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const renames = ['public.my_seq->public.my_seq2'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER SEQUENCE "my_seq" RENAME TO "my_seq2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('basic sequence: change name and fields', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 4,
		}),
	};

	const renames = ['public.my_seq->public.my_seq2'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER SEQUENCE "my_seq" RENAME TO "my_seq2";',
		'ALTER SEQUENCE "my_seq2" INCREMENT BY 4 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('Add basic sequences', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', { startWith: 100 }),
	};

	const schema2 = {
		seq: pgSequence('my_seq', { startWith: 100 }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
