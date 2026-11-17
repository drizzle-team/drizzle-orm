import {
	bigint,
	boolean,
	customType,
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

// The text `row` of each case is an array literal, because the plain cast `"values"::text[]` parses text as an
// array literal. For another value the statement fails, and the user writes the conversion into the USING clause.
test.each([
	{
		name: 'a text column that becomes an array',
		from: text(),
		to: text().array(),
		row: `'{a}'`,
		value: ['a'],
		sql: ['ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE text[] USING "values"::text[];'],
	},
	{
		name: 'a text column with a default that becomes an array',
		from: text().default('a'),
		to: text().array().default(['a']),
		row: `'{a}'`,
		value: ['a'],
		sql: [
			'ALTER TABLE "test" ALTER COLUMN "values" DROP DEFAULT;',
			'ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE text[] USING "values"::text[];',
			`ALTER TABLE "test" ALTER COLUMN "values" SET DEFAULT '{a}'::text[];`,
		],
	},
	{
		name: 'a text array column that becomes a scalar',
		from: text().array(),
		to: text(),
		row: `'{a,b}'`,
		value: '{a,b}',
		sql: ['ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE text USING "values"::text;'],
	},
])('$name gets a type change that runs', async ({ from, to, row, value, sql }) => {
	const before = { test: pgTable('test', { values: from }) };
	const after = { test: pgTable('test', { values: to }) };

	const { sqlStatements: st } = await diff(before, after, []);
	await push({ db, to: before });
	await db.query(`INSERT INTO "test" VALUES (${row});`);
	const { sqlStatements: pst } = await push({ db, to: after });

	expect(st).toStrictEqual(sql);
	expect(pst).toStrictEqual(sql);
	expect(await db.query('SELECT "values" FROM "test";')).toStrictEqual([{ values: value }]);
});

// push writes nothing because Postgres treats `integer[]` and `integer[][]` as one type, and the count of
// dimensions in its catalog is not reliable. generate reads both counts from the schemas, so it writes the change.
test('a change between two array dimension counts gets a type change in generate and nothing in push', async () => {
	const before = { test: pgTable('test', { values: integer().array() }) };
	const after = { test: pgTable('test', { values: integer().array('[][]') }) };

	const { sqlStatements: st } = await diff(before, after, []);
	await push({ db, to: before });
	const { sqlStatements: pst } = await push({ db, to: after });
	for (const statement of st) await db.query(statement);

	expect(st).toStrictEqual([
		'ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE integer[][] USING "values"::integer[][];',
	]);
	expect(pst).toStrictEqual([]);
});

// The catalog stores 0 dimensions for the inherited column of `child`, so the database reader reports one
// dimension for it. push must still write no type change.
test('a two-dimension array column of an inherited table gets no type change in push', async () => {
	const columns = { values: integer().array('[][]') };
	const to = { parent: pgTable('parent', columns), child: pgTable('child', columns) };

	await db.query('CREATE TABLE "parent" ("values" integer[][]);');
	await db.query('CREATE TABLE "child" () INHERITS ("parent");');
	const { sqlStatements: pst } = await push({ db, to });

	expect(pst).toStrictEqual([]);
});

const mood = pgEnum('mood', ['ok', 'sad']);
// Each `sql` casts through text, because Postgres has no cast from an enum to an array of that enum.
test.each([
	{
		name: 'an enum column',
		from: () => mood(),
		to: () => mood().array(),
		sql: ['ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE "mood"[] USING "values"::text::"mood"[];'],
	},
	{
		name: 'an enum column with a default',
		from: () => mood().default('ok'),
		to: () => mood().array().default(['ok']),
		sql: [
			'ALTER TABLE "test" ALTER COLUMN "values" DROP DEFAULT;',
			'ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE "mood"[] USING "values"::text::"mood"[];',
			`ALTER TABLE "test" ALTER COLUMN "values" SET DEFAULT '{ok}'::"mood"[];`,
		],
	},
])('$name that becomes an array gets a type change that runs', async ({ from, to, sql }) => {
	const before = { mood, test: pgTable('test', { values: from() }) };
	const after = { mood, test: pgTable('test', { values: to() }) };

	const { sqlStatements: st } = await diff(before, after, []);
	await push({ db, to: before });
	const { sqlStatements: pst } = await push({ db, to: after });

	expect(st).toStrictEqual(sql);
	expect(pst).toStrictEqual(sql);
});

// The diff keeps the plain cast although it fails here, because Postgres has no cast from integer to integer[].
// The user writes the conversion into the USING clause of the migration.
test('an integer column that becomes an array gets a type change with a plain cast', async () => {
	const before = { test: pgTable('test', { values: integer() }) };
	const after = { test: pgTable('test', { values: integer().array() }) };

	const { sqlStatements: st } = await diff(before, after, []);
	await push({ db, to: before });

	expect(st).toStrictEqual([
		'ALTER TABLE "test" ALTER COLUMN "values" SET DATA TYPE integer[] USING "values"::integer[];',
	]);
	await expect(db.query(st[0])).rejects.toThrow('cannot cast type integer to integer[]');
});

test.each([
	{ dataType: 'text[]', defaultValue: ['a'], column: `"values" text[] DEFAULT '{a}'::text[]` },
	{ dataType: 'text[3]', defaultValue: undefined, column: '"values" text[]' },
])('a custom type with the type text $dataType is an array column', async ({ dataType, defaultValue, column }) => {
	const list = customType<{ data: string[] }>({ dataType: () => dataType });
	const to = { test: pgTable('test', { values: defaultValue ? list().default(defaultValue) : list() }) };

	const { sqlStatements: st } = await diff({}, to, []);
	for (const statement of st) await db.query(statement);
	const { sqlStatements: pst } = await push({ db, to });

	expect(st).toStrictEqual([`CREATE TABLE "test" (\n\t${column}\n);\n`]);
	expect(pst).toStrictEqual([]);
});

// The catalog puts `int_list`, `int2vector` and `oidvector` in the array category. The columns of these types
// have no array dimensions, so push must not read them as array columns.
test('a column of a domain over an array type or of a vector type of the catalog gets no type change in push', async () => {
	const column = (dataType: string) => customType<{ data: unknown }>({ dataType: () => dataType })();
	const to = {
		test: pgTable('test', { values: column('int_list'), numbers: column('int2vector'), ids: column('oidvector') }),
	};

	await db.query('CREATE DOMAIN int_list AS integer[];');
	await db.query('CREATE TABLE "test" ("values" int_list, "numbers" int2vector, "ids" oidvector);');
	const { sqlStatements: pst } = await push({ db, to });

	expect(pst).toStrictEqual([]);
});
