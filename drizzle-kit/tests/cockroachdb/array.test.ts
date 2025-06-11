import {
	bigint,
	boolean,
	cockroachdbEnum,
	cockroachdbTable,
	date,
	int4,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/cockroachdb-core';
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
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
			values: int4('values').array().default([]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['public'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['public'] });

	const st0 = [`ALTER TABLE "test" ADD COLUMN "values" int4[] DEFAULT '{}'::int4[];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #2: int4 array default', async (t) => {
	const from = {
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
			values: int4('values').array().default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE \"test\" ADD COLUMN \"values\" int4[] DEFAULT '{1,2,3}'::int4[];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #3: bigint array default', async (t) => {
	const from = {
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
			values: bigint('values', { mode: 'bigint' }).array().default([BigInt(1), BigInt(2), BigInt(3)]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE \"test\" ADD COLUMN \"values\" int8[] DEFAULT '{1,2,3}'::int8[];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #4: boolean array default', async (t) => {
	const from = {
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
			values: boolean('values').array().default([true, false, true]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE \"test\" ADD COLUMN \"values\" boolean[] DEFAULT '{true,false,true}'::boolean[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #6: date array default', async (t) => {
	const from = {
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
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
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
			values: timestamp('values').array().default([new Date('2024-08-06'), new Date('2024-08-07')]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "test" ADD COLUMN "values" timestamp[] DEFAULT \'{"2024-08-06 00:00:00.000","2024-08-07 00:00:00.000"}\'::timestamp[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('array #9: text array default', async (t) => {
	const from = {
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
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
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachdbTable('test', {
			id: int4('id'),
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
	const testEnum = cockroachdbEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		enum: testEnum,
		test: cockroachdbTable('test', {
			id: int4('id'),
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
	const testEnum = cockroachdbEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: cockroachdbTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		enum: testEnum,
		test: cockroachdbTable('test', {
			id: int4('id'),
			values: testEnum('values').array().default([]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = ['ALTER TABLE "test" ADD COLUMN "values" "test_enum"[] DEFAULT \'{}\'::"test_enum"[];'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
