import {
	bigint,
	boolean,
	cockroachEnum,
	cockroachTable,
	date,
	int4,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('array #1: empty array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
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

test.concurrent('array #2: int4 array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
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

test.concurrent('array #3: bigint array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
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

test.concurrent('array #4: boolean array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
			id: int4('id'),
			values: boolean('values').array().default([true, false, true]),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE \"test\" ADD COLUMN \"values\" bool[] DEFAULT '{true,false,true}'::bool[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('array #6: date array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
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

test.concurrent('array #7: timestamp array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
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

test.concurrent('array #9: text array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
			id: int4('id'),
			values: text('values').array().default(['abc', 'def']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = ['ALTER TABLE "test" ADD COLUMN "values" string[] DEFAULT \'{abc,def}\'::string[];'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('array #10: uuid array default', async ({ dbc: db }) => {
	const from = {
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		test: cockroachTable('test', {
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

test.concurrent('array #11: enum array default', async ({ dbc: db }) => {
	const testEnum = cockroachEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		enum: testEnum,
		test: cockroachTable('test', {
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

test.concurrent('array #12: enum empty array default', async ({ dbc: db }) => {
	const testEnum = cockroachEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: cockroachTable('test', {
			id: int4('id'),
		}),
	};
	const to = {
		enum: testEnum,
		test: cockroachTable('test', {
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
