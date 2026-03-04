import {
	bigint,
	boolean,
	date,
	integer,
	json,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
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

test('array #1: empty array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT '{}'::integer[];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #2: integer array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE \"test\" ADD COLUMN \"values\" integer[] DEFAULT '{1,2,3}'::integer[];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #3: bigint array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: bigint('values', { mode: 'bigint' }).array().default([BigInt(1), BigInt(2), BigInt(3)]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE \"test\" ADD COLUMN \"values\" bigint[] DEFAULT '{1,2,3}'::bigint[];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #4: boolean array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: boolean('values').array().default([true, false, true]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE \"test\" ADD COLUMN \"values\" boolean[] DEFAULT '{t,f,t}'::boolean[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #5: multi-dimensional array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array('[][]').default([[1, 2], [3, 4]]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "test" ADD COLUMN "values" integer[][] DEFAULT '{{1,2},{3,4}}'::integer[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #6: date array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: date('values').array().default(['2024-08-06', '2024-08-07']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "test" ADD COLUMN "values" date[] DEFAULT \'{2024-08-06,2024-08-07}\'::date[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #7: timestamp array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: timestamp('values').array().default([new Date('2024-08-06'), new Date('2024-08-07')]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, ignoreSubsequent: true });
	const { sqlStatements: pst } = await push({ db, to, ignoreSubsequent: true });

	const st0 = [
		'ALTER TABLE "test" ADD COLUMN "values" timestamp[] DEFAULT \'{"2024-08-06 00:00:00.000","2024-08-07 00:00:00.000"}\'::timestamp[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #8: json array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: json('values').array().default([{ a: 1 }, { b: 2 }]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "test" ADD COLUMN "values" json[] DEFAULT '{"{\\"a\\":1}","{\\"b\\":2}"}'::json[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #9: text array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: text('values').array().default(['abc', 'def']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = ['ALTER TABLE "test" ADD COLUMN "values" text[] DEFAULT \'{abc,def}\'::text[];'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #10: uuid array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: uuid('values').array().default([
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
				'b0eebc99-9c0b-4ef8-bb6d-cbb9bd380a11',
			]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "test" ADD COLUMN "values" uuid[] DEFAULT \'{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,b0eebc99-9c0b-4ef8-bb6d-cbb9bd380a11}\'::uuid[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #11: enum array default', async (t) => {
	const testEnum = pgEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: testEnum('values').array().default(['a', 'b', 'c']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "test" ADD COLUMN "values" "test_enum"[] DEFAULT \'{a,b,c}\'::"test_enum"[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #12: enum empty array default', async (t) => {
	const testEnum = pgEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: testEnum('values').array().default(['a', 'b']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = ['ALTER TABLE "test" ADD COLUMN "values" "test_enum"[] DEFAULT \'{a,b}\'::"test_enum"[];'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5013
test('array #13: not null', async (t) => {
	const to = {
		test: pgTable('table1', {
			values: varchar({ length: 20 }).notNull().array(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = ['CREATE TABLE "table1" (\n\t"values" varchar(20)[] NOT NULL\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
