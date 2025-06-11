import { cockroachdbSchema, cockroachdbSequence } from 'drizzle-orm/cockroachdb-core';
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
		seq: cockroachdbSequence('name', { startWith: 100 }),
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
		seq: cockroachdbSequence('name', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
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
		'CREATE SEQUENCE "public"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create sequence: custom schema', async () => {
	const customSchema = cockroachdbSchema('custom');
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
	const customSchema = cockroachdbSchema('custom');
	const from = { customSchema };
	const to = {
		customSchema,
		seq: customSchema.sequence('name', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'CREATE SEQUENCE "custom"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop sequence', async () => {
	const from = { seq: cockroachdbSequence('name', { startWith: 100 }) };
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
	const customSchema = cockroachdbSchema('custom');
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

test('rename sequence', async () => {
	const from = { seq: cockroachdbSequence('name', { startWith: 100 }) };
	const to = { seq: cockroachdbSequence('name_new', { startWith: 100 }) };

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
	const customSchema = cockroachdbSchema('custom');

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
	const customSchema = cockroachdbSchema('custom');
	const from = { customSchema, seq: cockroachdbSequence('name', { startWith: 100 }) };
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
	const customSchema = cockroachdbSchema('custom');
	const from = { customSchema, seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { customSchema, seq: cockroachdbSequence('name', { startWith: 100 }) };

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

test('alter sequence', async () => {
	const from = { seq: cockroachdbSequence('name', { startWith: 100 }) };
	const to = { seq: cockroachdbSequence('name', { startWith: 105 }) };

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
		seq: cockroachdbSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachdbSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

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
		seq: cockroachdbSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachdbSequence('my_seq', {
			startWith: 100,
			maxValue: 100000,
			minValue: 100,

			cache: 10,
			increment: 4,
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER SEQUENCE "my_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 100000 START WITH 100 CACHE 10;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('basic sequence: change name', async () => {
	const schema1 = {
		seq: cockroachdbSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachdbSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

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
		seq: cockroachdbSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachdbSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

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
		'ALTER SEQUENCE "my_seq2" INCREMENT BY 4 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('Add basic sequences', async () => {
	const schema1 = {
		seq: cockroachdbSequence('my_seq', { startWith: 100 }),
	};

	const schema2 = {
		seq: cockroachdbSequence('my_seq', { startWith: 100 }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
