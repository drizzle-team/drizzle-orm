import { cockroachSchema, cockroachSequence } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('create sequence', async ({ db }) => {
	const to = {
		seq: cockroachSequence('name', { startWith: 100 }),
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

test.concurrent('create sequence: all fields', async ({ db }) => {
	const from = {};
	const to = {
		seq: cockroachSequence('name', {
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

test.concurrent('create sequence: custom schema', async ({ db }) => {
	const customSchema = cockroachSchema('custom');
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

test.concurrent('create sequence: custom schema + all fields', async ({ db }) => {
	const customSchema = cockroachSchema('custom');
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

test.concurrent('drop sequence', async ({ db }) => {
	const from = { seq: cockroachSequence('name', { startWith: 100 }) };
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

test.concurrent('drop sequence: custom schema', async ({ db }) => {
	const customSchema = cockroachSchema('custom');
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

test.concurrent('rename sequence', async ({ db }) => {
	const from = { seq: cockroachSequence('name', { startWith: 100 }) };
	const to = { seq: cockroachSequence('name_new', { startWith: 100 }) };

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

test.concurrent('rename sequence in custom schema', async ({ db }) => {
	const customSchema = cockroachSchema('custom');

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

test.concurrent('move sequence between schemas #1', async ({ db }) => {
	const customSchema = cockroachSchema('custom');
	const from = { customSchema, seq: cockroachSequence('name', { startWith: 100 }) };
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

test.concurrent('move sequence between schemas #2', async ({ db }) => {
	const customSchema = cockroachSchema('custom');
	const from = { customSchema, seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { customSchema, seq: cockroachSequence('name', { startWith: 100 }) };

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

test.concurrent('alter sequence', async ({ db }) => {
	const from = { seq: cockroachSequence('name', { startWith: 100 }) };
	const to = { seq: cockroachSequence('name', { startWith: 105 }) };

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

test.concurrent('full sequence: no changes', async ({ db }) => {
	const schema1 = {
		seq: cockroachSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachSequence('my_seq', {
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

test.concurrent('basic sequence: change fields', async ({ db }) => {
	const schema1 = {
		seq: cockroachSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachSequence('my_seq', {
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

test.concurrent('basic sequence: change name', async ({ db }) => {
	const schema1 = {
		seq: cockroachSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachSequence('my_seq2', {
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

test.concurrent('basic sequence: change name and fields', async ({ db }) => {
	const schema1 = {
		seq: cockroachSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,

			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: cockroachSequence('my_seq2', {
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

test.concurrent('Add basic sequences', async ({ db }) => {
	const schema1 = {
		seq: cockroachSequence('my_seq', { startWith: 100 }),
	};

	const schema2 = {
		seq: cockroachSequence('my_seq', { startWith: 100 }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
