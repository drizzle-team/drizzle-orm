import { sql } from 'drizzle-orm';
import {
	bigint,
	bit,
	bool,
	char,
	cockroachEnum,
	date,
	decimal,
	doublePrecision,
	float,
	geometry,
	inet,
	int4,
	int8,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/cockroach-core';
import { varbit } from 'drizzle-orm/cockroach-core/columns/varbit';
import { afterEach } from 'node:test';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffDefault, prepareTestDatabase, TestDatabase, TestDatabaseKit } from './mocks';

// @vitest-environment-options {"max-concurrency":5}

let _: TestDatabaseKit;

declare module 'vitest' {
	export interface TestContext {
		db: TestDatabase;
		release: () => void;
	}
}

beforeAll(async (ctx) => {
	_ = await prepareTestDatabase(true);
});

afterAll(async (ctx) => {
	await _.close();
});

beforeEach(async (ctx) => {
	const { db, release } = _.acquire();
	ctx.db = db;
	ctx.onTestFinished(() => {
		release();
	});
});

test('int4', async (ctx) => {
	const res1 = await diffDefault(ctx.db, int4().default(10), '10');
	const res2 = await diffDefault(ctx.db, int4().default(0), '0');
	const res3 = await diffDefault(ctx.db, int4().default(-10), '-10');
	const res4 = await diffDefault(ctx.db, int4().default(1e4), '10000');
	const res5 = await diffDefault(ctx.db, int4().default(-1e4), '-10000');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
});

test('int4 arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, int4().array().default([]), "'{}'::int4[]");
	const res2 = await diffDefault(ctx.db, int4().array().default([10]), "'{10}'::int4[]");

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
});

test('smallint', async (ctx) => {
	// 2^15 - 1
	const res1 = await diffDefault(ctx.db, smallint().default(32767), '32767');
	// -2^15
	const res2 = await diffDefault(ctx.db, smallint().default(-32768), '-32768');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
});

test('smallint arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, smallint().array().default([]), "'{}'::int2[]");
	const res2 = await diffDefault(ctx.db, smallint().array().default([32767]), "'{32767}'::int2[]");

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
});

test('bigint', async (ctx) => {
	// 2^53
	const res1 = await diffDefault(ctx.db, int8({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res2 = await diffDefault(ctx.db, int8({ mode: 'number' }).default(-9007199254740991), '-9007199254740991');
	// 2^63 - 1
	const res3 = await diffDefault(
		ctx.db,
		bigint({ mode: 'bigint' }).default(9223372036854775807n),
		'9223372036854775807',
	);
	// -2^63
	const res4 = await diffDefault(
		ctx.db,
		bigint({ mode: 'bigint' }).default(-9223372036854775808n),
		'-9223372036854775808',
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
});

test('bigint arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, bigint({ mode: 'number' }).array().default([]), "'{}'::int8[]");
	const res2 = await diffDefault(ctx.db, bigint({ mode: 'bigint' }).array().default([]), "'{}'::int8[]");

	const res3 = await diffDefault(
		ctx.db,
		bigint({ mode: 'number' }).array().default([9007199254740991]),
		"'{9007199254740991}'::int8[]",
	);
	const res4 = await diffDefault(
		ctx.db,
		bigint({ mode: 'bigint' }).array().default([9223372036854775807n]),
		"'{9223372036854775807}'::int8[]",
	);

	const res9 = await diffDefault(ctx.db, bigint({ mode: 'number' }).array().default([1, 2]), "'{1,2}'::int8[]");
	const res10 = await diffDefault(ctx.db, bigint({ mode: 'bigint' }).array().default([1n, 2n]), "'{1,2}'::int8[]");

	const res13 = await diffDefault(
		ctx.db,
		bigint({ mode: 'bigint' })
			.array()
			.default(sql`'{}'`),
		"'{}'::int8[]",
	);
	const res14 = await diffDefault(
		ctx.db,
		bigint({ mode: 'bigint' })
			.array()
			.default(sql`'{}'::int8[]`),
		"'{}'::int8[]",
	);
	const res15 = await diffDefault(
		ctx.db,
		bigint({ mode: 'bigint' })
			.array()
			.default(sql`'{9223372036854775807}'::int8[]`),
		"'{9223372036854775807}'::int8[]",
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res10).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
});

test('numeric', async (ctx) => {
	const res1 = await diffDefault(ctx.db, numeric().default('10.123'), '10.123');

	const res4 = await diffDefault(ctx.db, numeric({ mode: 'string' }).default('10.123'), '10.123');
	const res2 = await diffDefault(
		ctx.db,
		numeric({ mode: 'bigint' }).default(9223372036854775807n),
		'9223372036854775807',
	);
	const res3 = await diffDefault(ctx.db, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');

	const res5 = await diffDefault(ctx.db, numeric({ precision: 6 }).default('10.123'), '10.123');
	const res6 = await diffDefault(ctx.db, numeric({ precision: 6, scale: 2 }).default('10.123'), '10.123');

	const res7 = await diffDefault(ctx.db, numeric({ precision: 6 }).default('10'), '10');
	const res8 = await diffDefault(ctx.db, numeric({ precision: 6, scale: 2 }).default('10'), '10');

	const res7_1 = await diffDefault(ctx.db, numeric({ precision: 6 }).default('10.100'), '10.100');
	const res8_1 = await diffDefault(ctx.db, numeric({ precision: 6, scale: 2 }).default('10.100'), '10.100');
	const res7_2 = await diffDefault(ctx.db, numeric({ mode: 'number', precision: 6 }).default(10.100), '10.1');
	const res8_2 = await diffDefault(ctx.db, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.10), '10.1');

	const res9 = await diffDefault(ctx.db, numeric({ mode: 'string', scale: 2 }).default('10.123'), '10.123');
	const res10 = await diffDefault(ctx.db, numeric({ mode: 'string', precision: 6 }).default('10.123'), '10.123');
	const res11 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'),
		'10.123',
	);

	const res12 = await diffDefault(
		ctx.db,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'9223372036854775807',
	);
	const res13 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.123),
		'10.123',
	);
	const res14 = await diffDefault(ctx.db, numeric({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res15 = await diffDefault(ctx.db, numeric({ mode: 'number', precision: 6 }).default(10.123), '10.123');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
	expect(res7_1).toStrictEqual([]);
	expect(res8_1).toStrictEqual([]);
	expect(res7_2).toStrictEqual([]);
	expect(res8_2).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res10).toStrictEqual([]);
	expect(res11).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
});

test('numeric arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, numeric({ mode: 'number' }).array().default([]), "'{}'::decimal[]");
	const res2 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);
	const res3 = await diffDefault(ctx.db, numeric({ mode: 'bigint' }).array().default([]), "'{}'::decimal[]");
	const res4 = await diffDefault(
		ctx.db,
		numeric({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::decimal(4)[]",
	);
	const res5 = await diffDefault(ctx.db, numeric({ mode: 'string' }).array().default([]), "'{}'::decimal[]");
	const res6 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res7_1 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number' }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res7_2 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.153]),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res7_3 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number', precision: 6 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_4 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number', precision: 6, scale: 3 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_5 = await diffDefault(
		ctx.db,
		numeric({ mode: 'number', precision: 6, scale: 3 }).array().default([10, 123]),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res8_1 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string' }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res8_2 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.153']),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res8_3 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string', precision: 6 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_4 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string', precision: 6, scale: 3 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_5 = await diffDefault(
		ctx.db,
		numeric({ mode: 'string', precision: 6, scale: 3 }).array().default(['10', '123']),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res9_1 = await diffDefault(
		ctx.db,
		numeric({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal[]",
	);

	// scale will be 0
	// default will be trimmed to integer part
	const res9_2 = await diffDefault(
		ctx.db,
		numeric({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(19)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res9_3 = await diffDefault(
		ctx.db,
		numeric({ mode: 'bigint', precision: 23, scale: 3 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(23,3)[]",
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);

	expect(res7_1).toStrictEqual([]);
	expect(res7_2).toStrictEqual([]);
	expect(res7_3).toStrictEqual([]);
	expect(res7_4).toStrictEqual([]);
	expect(res7_5).toStrictEqual([]);

	expect(res8_1).toStrictEqual([]);
	expect(res8_2).toStrictEqual([]);
	expect(res8_3).toStrictEqual([]);
	expect(res8_4).toStrictEqual([]);
	expect(res8_5).toStrictEqual([]);

	expect(res9_1).toStrictEqual([]);
	expect(res9_2).toStrictEqual([]);
	expect(res9_3).toStrictEqual([]);
});

test('decimal', async (ctx) => {
	const res1 = await diffDefault(ctx.db, decimal().default('10.123'), '10.123');

	const res4 = await diffDefault(ctx.db, decimal({ mode: 'string' }).default('10.123'), '10.123');
	const res2 = await diffDefault(
		ctx.db,
		decimal({ mode: 'bigint' }).default(9223372036854775807n),
		'9223372036854775807',
	);
	const res3 = await diffDefault(ctx.db, decimal({ mode: 'number' }).default(9007199254740991), '9007199254740991');

	const res5 = await diffDefault(ctx.db, decimal({ precision: 6 }).default('10.123'), '10.123');
	const res6 = await diffDefault(ctx.db, decimal({ precision: 6, scale: 2 }).default('10.123'), '10.123');

	const res7 = await diffDefault(ctx.db, decimal({ precision: 6 }).default('10'), '10');
	const res8 = await diffDefault(ctx.db, decimal({ precision: 6, scale: 2 }).default('10'), '10');

	const res7_1 = await diffDefault(ctx.db, decimal({ precision: 6 }).default('10.100'), '10.100');
	const res8_1 = await diffDefault(ctx.db, decimal({ precision: 6, scale: 2 }).default('10.100'), '10.100');
	const res7_2 = await diffDefault(ctx.db, decimal({ mode: 'number', precision: 6 }).default(10.1), '10.1'); // js trims .100 to 0.1
	const res8_2 = await diffDefault(ctx.db, decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.1), '10.1'); // js trims .100 to 0.1

	const res9 = await diffDefault(ctx.db, decimal({ mode: 'string', scale: 2 }).default('10.123'), '10.123');
	const res10 = await diffDefault(ctx.db, decimal({ mode: 'string', precision: 6 }).default('10.123'), '10.123');
	const res11 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string', precision: 6, scale: 2 }).default('10.123'),
		'10.123',
	);

	const res12 = await diffDefault(
		ctx.db,
		decimal({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'9223372036854775807',
	);
	const res13 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.123),
		'10.123',
	);
	const res14 = await diffDefault(ctx.db, decimal({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res15 = await diffDefault(ctx.db, decimal({ mode: 'number', precision: 6 }).default(10.123), '10.123');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
	expect(res7_1).toStrictEqual([]);
	expect(res8_1).toStrictEqual([]);
	expect(res7_2).toStrictEqual([]);
	expect(res8_2).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res10).toStrictEqual([]);
	expect(res11).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
});

test('decimals arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, decimal({ mode: 'number' }).array().default([]), "'{}'::decimal[]");
	const res2 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);
	const res3 = await diffDefault(ctx.db, decimal({ mode: 'bigint' }).array().default([]), "'{}'::decimal[]");
	const res4 = await diffDefault(
		ctx.db,
		decimal({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::decimal(4)[]",
	);
	const res5 = await diffDefault(ctx.db, decimal({ mode: 'string' }).array().default([]), "'{}'::decimal[]");
	const res6 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res7_1 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number' }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res7_2 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.153]),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res7_3 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number', precision: 6 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_4 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number', precision: 6, scale: 3 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_5 = await diffDefault(
		ctx.db,
		decimal({ mode: 'number', precision: 6, scale: 3 }).array().default([10, 123]),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res8_1 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string' }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res8_2 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.153']),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res8_3 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string', precision: 6 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_4 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string', precision: 6, scale: 3 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_5 = await diffDefault(
		ctx.db,
		decimal({ mode: 'string', precision: 6, scale: 3 }).array().default(['10', '123']),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res9_1 = await diffDefault(
		ctx.db,
		decimal({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal[]",
	);

	// scale will be 0
	// default will be trimmed to integer part
	const res9_2 = await diffDefault(
		ctx.db,
		decimal({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(19)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res9_3 = await diffDefault(
		ctx.db,
		decimal({ mode: 'bigint', precision: 23, scale: 3 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(23,3)[]",
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);

	expect(res7_1).toStrictEqual([]);
	expect(res7_2).toStrictEqual([]);
	expect(res7_3).toStrictEqual([]);
	expect(res7_4).toStrictEqual([]);
	expect(res7_5).toStrictEqual([]);

	expect(res8_1).toStrictEqual([]);
	expect(res8_2).toStrictEqual([]);
	expect(res8_3).toStrictEqual([]);
	expect(res8_4).toStrictEqual([]);
	expect(res8_5).toStrictEqual([]);

	expect(res9_1).toStrictEqual([]);
	expect(res9_2).toStrictEqual([]);
	expect(res9_3).toStrictEqual([]);
});

test('real', async (ctx) => {
	const res1 = await diffDefault(ctx.db, real().default(1000.123), '1000.123');
	const res2 = await diffDefault(ctx.db, real().default(1000), '1000');
	const res3 = await diffDefault(ctx.db, real().default(1000.3), '1000.3');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
});

test('real arrays', async (ctx) => {
	const res2 = await diffDefault(ctx.db, real().array().default([]), `'{}'::real[]`);
	const res3 = await diffDefault(ctx.db, real().array().default([1000.123, 10.2]), `'{1000.123,10.2}'::real[]`);
	const res4 = await diffDefault(ctx.db, real().array().default([1000.2]), `'{1000.2}'::real[]`);
	const res5 = await diffDefault(ctx.db, real().array().default([1000.123, 10]), `'{1000.123,10}'::real[]`);

	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
});

test('float', async (ctx) => {
	const res1 = await diffDefault(ctx.db, float().default(10000.123), '10000.123');
	const res2 = await diffDefault(ctx.db, float().default(10000), '10000');
	const res3 = await diffDefault(ctx.db, float().default(1000.3), '1000.3');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
});

test('float arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, float().array().default([]), `'{}'::float[]`);
	const res2 = await diffDefault(ctx.db, float().array().default([10000.123]), `'{10000.123}'::float[]`);
	const res3 = await diffDefault(ctx.db, float().array().default([10000, 14]), `'{10000,14}'::float[]`);
	const res4 = await diffDefault(ctx.db, float().array().default([1000.2]), `'{1000.2}'::float[]`);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
});

test('doublePrecision', async (ctx) => {
	const res1 = await diffDefault(ctx.db, doublePrecision().default(10000.123), '10000.123');
	const res2 = await diffDefault(ctx.db, doublePrecision().default(10000), '10000');
	const res3 = await diffDefault(ctx.db, doublePrecision().default(1000.3), '1000.3');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
});

test('doublePrecision arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, doublePrecision().array().default([]), `'{}'::float[]`);
	const res2 = await diffDefault(ctx.db, doublePrecision().array().default([10000.123]), `'{10000.123}'::float[]`);
	const res3 = await diffDefault(ctx.db, doublePrecision().array().default([10000, 14]), `'{10000,14}'::float[]`);
	const res4 = await diffDefault(ctx.db, doublePrecision().array().default([1000.2]), `'{1000.2}'::float[]`);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
});

test('bool', async (ctx) => {
	const res1 = await diffDefault(ctx.db, bool().default(true), 'true');
	const res2 = await diffDefault(ctx.db, bool().default(false), 'false');
	const res3 = await diffDefault(ctx.db, bool().default(sql`true`), 'true');

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
});

test('bool arrays', async (ctx) => {
	const res4 = await diffDefault(ctx.db, bool().array().default([]), `'{}'::bool[]`);
	const res5 = await diffDefault(ctx.db, bool().array().default([true]), `'{true}'::bool[]`);
	const res6 = await diffDefault(
		ctx.db,
		bool()
			.array()
			.default(sql`'{true}'::bool[]`),
		`'{true}'::bool[]`,
	);

	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
});

test('char', async (ctx) => {
	const res1 = await diffDefault(ctx.db, char({ length: 15 }).default('text'), `'text'`);
	const res2 = await diffDefault(ctx.db, char({ length: 15 }).default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(ctx.db, char({ length: 15 }).default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(ctx.db, char({ length: 15 }).default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(ctx.db, char({ length: 15, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res6 = await diffDefault(ctx.db, char({ length: 15 }).default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res7 = await diffDefault(
		ctx.db,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	const res9 = await diffDefault(ctx.db, char({ length: 15 }).default('text'), `'text'`);
	const res11 = await diffDefault(ctx.db, char({ length: 2 }).default('12'), `'12'`);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res11).toStrictEqual([]);
});

test('char arrays', async (ctx) => {
	const res7 = await diffDefault(ctx.db, char({ length: 15 }).array().default([]), `'{}'::char(15)[]`);
	const res8 = await diffDefault(ctx.db, char({ length: 15 }).array().default(['text']), `'{text}'::char(15)[]`);
	const res9 = await diffDefault(ctx.db, char().array().default(['text']), `'{text}'::char[]`);
	const res12 = await diffDefault(ctx.db, char({ length: 15 }).array().default(['\\']), `'{"\\\\"}'::char(15)[]`);
	const res13 = await diffDefault(ctx.db, char({ length: 15 }).array().default(["'"]), `'{''}'::char(15)[]`);
	const res14 = await diffDefault(
		ctx.db,
		char({ length: 15, enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::char(15)[]`,
	);
	const res15 = await diffDefault(
		ctx.db,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::char(15)[]`,
	);

	const res16 = await diffDefault(ctx.db, char({ length: 15 }).array().default([]), `'{}'::char(15)[]`);

	// char is bigger than default
	const res17 = await diffDefault(ctx.db, char({ length: 15 }).array().default(['text']), `'{text}'::char(15)[]`);
	// char is less than default
	const res18 = await diffDefault(ctx.db, char({ length: 2 }).array().default(['text']), `'{text}'::char(2)[]`);
	const res18_1 = await diffDefault(ctx.db, char({ length: 2 }).array().default(["t'"]), `'{t''}'::char(2)[]`);

	const res18_2 = await diffDefault(ctx.db, char({ length: 2 }).array().default(['t\\']), `'{"t\\\\"}'::char(2)[]`);
	// char is same as default
	const res19 = await diffDefault(ctx.db, char({ length: 2 }).array().default(['12']), `'{12}'::char(2)[]`);

	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
	expect(res17).toStrictEqual([]);
	expect(res18).toStrictEqual([]);
	expect(res18_1).toStrictEqual([]);
	expect(res18_2).toStrictEqual([]);
	expect(res19).toStrictEqual([]);
});

test('varchar', async (ctx) => {
	const res1 = await diffDefault(ctx.db, varchar({ length: 255 }).default('text'), `'text'`);
	const res1_0 = await diffDefault(ctx.db, varchar().default('text'), `'text'`);
	const res2 = await diffDefault(ctx.db, varchar({ length: 255 }).default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(ctx.db, varchar({ length: 255 }).default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(ctx.db, varchar({ length: 255 }).default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(
		ctx.db,
		varchar({ length: 255, enum: ['one', 'two', 'three'] }).default('one'),
		"'one'",
	);
	const res5_1 = await diffDefault(ctx.db, varchar({ length: 255 }).default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		ctx.db,
		varchar({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	// varchar length is bigger than default
	const res9 = await diffDefault(ctx.db, varchar({ length: 15 }).default('text'), `'text'`);
	// varchar length is same as default
	const res11 = await diffDefault(ctx.db, varchar({ length: 2 }).default('12'), `'12'`);

	expect(res1).toStrictEqual([]);
	expect(res1_0).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res5_1).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res11).toStrictEqual([]);
});

test('varchar arrays', async (ctx) => {
	const res7 = await diffDefault(ctx.db, varchar({ length: 255 }).array().default([]), `'{}'::varchar(255)[]`);
	const res8 = await diffDefault(
		ctx.db,
		varchar({ length: 255 }).array().default(['text']),
		`'{text}'::varchar(255)[]`,
	);
	const res8_0 = await diffDefault(ctx.db, varchar().array().default(['text']), `'{text}'::varchar[]`);
	const res12 = await diffDefault(ctx.db, varchar({ length: 15 }).array().default(['\\']), `'{"\\\\"}'::varchar(15)[]`);
	const res13 = await diffDefault(ctx.db, varchar({ length: 15 }).array().default(["'"]), `'{''}'::varchar(15)[]`);
	const res14 = await diffDefault(
		ctx.db,
		varchar({ length: 15, enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::varchar(15)[]`,
	);
	const res15 = await diffDefault(
		ctx.db,
		varchar({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::varchar(255)[]`,
	);

	const res16 = await diffDefault(ctx.db, varchar({ length: 255 }).array().default([]), `'{}'::varchar(255)[]`);

	// char is bigger than default
	const res17 = await diffDefault(
		ctx.db,
		varchar({ length: 255 }).array().default(['text']),
		`'{text}'::varchar(255)[]`,
	);
	// char is less than default
	const res18 = await diffDefault(ctx.db, varchar({ length: 2 }).array().default(['text']), `'{text}'::varchar(2)[]`);
	const res18_1 = await diffDefault(ctx.db, varchar({ length: 2 }).array().default(["t'"]), `'{t''}'::varchar(2)[]`);

	const res18_2 = await diffDefault(
		ctx.db,
		varchar({ length: 2 }).array().default(['t\\']),
		`'{"t\\\\"}'::varchar(2)[]`,
	);
	// char is same as default
	const res19 = await diffDefault(ctx.db, varchar({ length: 2 }).array().default(['12']), `'{12}'::varchar(2)[]`);

	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
	expect(res8_0).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
	expect(res17).toStrictEqual([]);
	expect(res18).toStrictEqual([]);
	expect(res18_1).toStrictEqual([]);
	expect(res18_2).toStrictEqual([]);
	expect(res19).toStrictEqual([]);
});

test('text', async (ctx) => {
	const res1 = await diffDefault(ctx.db, text().default('text'), `'text'`);
	const res2 = await diffDefault(ctx.db, text().default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(ctx.db, text().default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(ctx.db, text().default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(ctx.db, text().default('one'), "'one'");
	const res5_1 = await diffDefault(ctx.db, text().default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		ctx.db,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res5_1).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
});

test('text arrays', async (ctx) => {
	const res7 = await diffDefault(ctx.db, text().array().default([]), `'{}'::string[]`);
	const res8 = await diffDefault(ctx.db, text().array().default(['text']), `'{text}'::string[]`);
	const res12 = await diffDefault(ctx.db, text().array().default(['\\']), `'{"\\\\"}'::string[]`);
	const res13 = await diffDefault(ctx.db, text().array().default(["'"]), `'{''}'::string[]`);
	const res14 = await diffDefault(
		ctx.db,
		text({ enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::string[]`,
	);
	const res15 = await diffDefault(
		ctx.db,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::string[]`,
	);

	const res16 = await diffDefault(ctx.db, text().array().default([]), `'{}'::string[]`);

	const res18 = await diffDefault(ctx.db, text().array().default(['text']), `'{text}'::string[]`);
	const res18_1 = await diffDefault(ctx.db, text().array().default(["t'"]), `'{t''}'::string[]`);

	const res18_2 = await diffDefault(ctx.db, text().array().default(['t\\']), `'{"t\\\\"}'::string[]`);

	const res20 = await diffDefault(ctx.db, text().array().default(["1234'4"]), `'{1234''4}'::string[]`);
	const res21 = await diffDefault(
		ctx.db,
		text().array().default(['1234\\1']),
		`'{"1234\\\\1"}'::string[]`,
	);

	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
	expect(res18).toStrictEqual([]);
	expect(res18_1).toStrictEqual([]);
	expect(res18_2).toStrictEqual([]);
	expect(res20).toStrictEqual([]);
	expect(res21).toStrictEqual([]);
});

test('string', async (ctx) => {
	const res1 = await diffDefault(ctx.db, string({ length: 255 }).default('text'), `'text'`);
	const res1_0 = await diffDefault(ctx.db, string().default('text'), `'text'`);
	const res2 = await diffDefault(ctx.db, string({ length: 255 }).default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(ctx.db, string({ length: 255 }).default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(ctx.db, string({ length: 255 }).default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(
		ctx.db,
		string({ length: 255, enum: ['one', 'two', 'three'] }).default('one'),
		"'one'",
	);
	const res5_1 = await diffDefault(ctx.db, string({ length: 255 }).default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		ctx.db,
		string({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	// varchar length is bigger than default
	const res9 = await diffDefault(ctx.db, string({ length: 15 }).default('text'), `'text'`);
	// varchar length is same as default
	const res11 = await diffDefault(ctx.db, string({ length: 2 }).default('12'), `'12'`);

	expect(res1).toStrictEqual([]);
	expect(res1_0).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res5_1).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res11).toStrictEqual([]);
});

test('string arrays', async (ctx) => {
	const res7 = await diffDefault(ctx.db, string({ length: 255 }).array().default([]), `'{}'::string(255)[]`);
	const res8 = await diffDefault(ctx.db, string({ length: 255 }).array().default(['text']), `'{text}'::string(255)[]`);
	const res8_0 = await diffDefault(ctx.db, string().array().default(['text']), `'{text}'::string[]`);
	const res12 = await diffDefault(ctx.db, string({ length: 15 }).array().default(['\\']), `'{"\\\\"}'::string(15)[]`);
	const res13 = await diffDefault(ctx.db, string({ length: 15 }).array().default(["'"]), `'{''}'::string(15)[]`);
	const res14 = await diffDefault(
		ctx.db,
		string({ length: 15, enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::string(15)[]`,
	);
	const res15 = await diffDefault(
		ctx.db,
		string({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::string(255)[]`,
	);

	// char is bigger than default
	const res17 = await diffDefault(ctx.db, string({ length: 255 }).array().default(['text']), `'{text}'::string(255)[]`);
	// char is less than default
	const res18 = await diffDefault(ctx.db, string({ length: 2 }).array().default(['text']), `'{text}'::string(2)[]`);
	const res18_1 = await diffDefault(ctx.db, string({ length: 2 }).array().default(["t'"]), `'{t''}'::string(2)[]`);
	const res18_2 = await diffDefault(ctx.db, string({ length: 2 }).array().default(['t\\']), `'{"t\\\\"}'::string(2)[]`);
	// char is same as default
	const res19 = await diffDefault(ctx.db, string({ length: 2 }).array().default(['12']), `'{12}'::string(2)[]`);
	const res22 = await diffDefault(
		ctx.db,
		string({ length: 3 }).array().default(['"1234545"']),
		`'{"\\"1234545\\""}'::string(3)[]`,
	);

	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
	expect(res8_0).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res14).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
	expect(res17).toStrictEqual([]);
	expect(res18).toStrictEqual([]);
	expect(res18_1).toStrictEqual([]);
	expect(res18_2).toStrictEqual([]);
	expect(res19).toStrictEqual([]);
	expect(res22).toStrictEqual([]);
});

test('jsonb', async (ctx) => {
	const res1 = await diffDefault(ctx.db, jsonb().default({}), `'{}'`);
	const res2 = await diffDefault(ctx.db, jsonb().default([]), `'[]'`);
	const res3 = await diffDefault(ctx.db, jsonb().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(ctx.db, jsonb().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(ctx.db, jsonb().default({ key: "val'ue" }), `e'{"key":"val\\'ue"}'`);
	const res6 = await diffDefault(ctx.db, jsonb().default({ key: `mo''",\`}{od` }), `e'{"key":"mo\\'\\'\\\\",\`}{od"}'`);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	// await expect().rejects
	// 	.toThrowError();
});

// tests were commented since there are too many of them
test('timestamp', async (ctx) => {
	// normal without timezone
	const res1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	// precision same as in default
	const res2 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	const res3 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 1 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);

	// all string variations
	// normal: without timezone
	const res9 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);

	const res9_2 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53'),
		`'2025-05-23T12:53:53'`,
	);
	// normal: timezone with "zero UTC offset" in the end
	const res10 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	
	// normal: timezone with custom timezone
	const res12 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115+03'),
		`'2025-05-23T12:53:53.115+03'`,
	);

	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// without UTC
	const res13 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1 }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	
	// custom timezone
	const res16 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1 }).default('2025-05-23T12:53:53.116+04:30'),
		`'2025-05-23T12:53:53.116+04:30'`,
	);

	// precision same
	// No timezone
	const res17 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	// precision same
	// zero timezone
	const res18 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	
	// custom timezone
	const res20 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);

	// precision is bigget than in default
	// No timezone
	const res21 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	// precision is bigget than in default
	// zero timezone
	const res22 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	
	const res24 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);

	const res25 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).defaultNow(),
		`now()`,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res9_2).toStrictEqual([]);
	expect(res10).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
	expect(res17).toStrictEqual([]);
	expect(res18).toStrictEqual([]);
	expect(res20).toStrictEqual([]);
	expect(res21).toStrictEqual([]);
	expect(res22).toStrictEqual([]);
	expect(res24).toStrictEqual([]);
	expect(res25).toStrictEqual([]);
});

test('timestamp arrays', async (ctx) => {
	const res1_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date' }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);

	const res2_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 3 }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp(3)[]`,
	);
	
	const res3_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 1 }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp(1)[]`,
	);

	const res9_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp[]`,
	);
	const res9_3 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.0']),
		`'{"2025-05-23T12:53:53.0"}'::timestamp[]`,
	);
	
	const res10_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp[]`,
	);
	
	const res12_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115+03']),
		`'{"2025-05-23T12:53:53.115+03"}'::timestamp[]`,
	);

	const res13_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1 }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(1)[]`,
	);
	
	const res16_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1 }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(1)[]`,
	);

	const res17_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(3)[]`,
	);
	
	const res18_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(3)[]`,
	);
	
	const res20_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(3)[]`,
	);

	const res21_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(5)[]`,
	);
	
	const res22_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(5)[]`,
	);
	
	const res24_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(5)[]`,
	);

	expect(res1_1).toStrictEqual([]);
	expect(res2_1).toStrictEqual([]);
	expect(res3_1).toStrictEqual([]);
	expect(res9_1).toStrictEqual([]);
	expect(res9_3).toStrictEqual([]);
	expect(res10_1).toStrictEqual([]);
	expect(res12_1).toStrictEqual([]);
	expect(res13_1).toStrictEqual([]);
	expect(res16_1).toStrictEqual([]);
	expect(res17_1).toStrictEqual([]);
	expect(res18_1).toStrictEqual([]);
	expect(res20_1).toStrictEqual([]);
	expect(res21_1).toStrictEqual([]);
	expect(res22_1).toStrictEqual([]);
	expect(res24_1).toStrictEqual([]);
});

test('timestamptz', async (ctx) => {
	// all dates variations

	// normal with timezone
	const res5 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	
	// precision same as in default
	const res6 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	const res7 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 1, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);

	// all string variations
	// normal: without timezone
	const res9 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res9_2 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53'),
		`'2025-05-23T12:53:53'`,
	);
	const res9_3 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.0'),
		`'2025-05-23T12:53:53.0'`,
	);
	// normal: timezone with custom timezone
	const res12 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.115+03'),
		`'2025-05-23T12:53:53.115+03'`,
	);

	// precision is bigger than in default
	// cockroach will not pad this
	// without UTC
	const res13 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);

	// custom timezone
	const res16 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);

	// precision is less than in default
	// cockroach will not trim this
	// without UTC
	const res17 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);

	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// zero UTC
	const res18 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);

	const res20 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);

	// precision same
	// without UTC
	const res21 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);

	// precision same
	// zero UTC
	const res22 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);

	// precision same
	// custom timezone
	const res24 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);

	const res25 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).defaultNow(),
		`now()`,
	);

	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
	expect(res9).toStrictEqual([]);
	expect(res9_2).toStrictEqual([]);
	expect(res9_3).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
	expect(res17).toStrictEqual([]);
	expect(res18).toStrictEqual([]);
	expect(res20).toStrictEqual([]);
	expect(res21).toStrictEqual([]);
	expect(res22).toStrictEqual([]);
	expect(res24).toStrictEqual([]);
	expect(res25).toStrictEqual([]);
});

test('timestamptz arrays', async (ctx) => {
	const res5_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', withTimezone: true }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz[]`,
	);
	
	const res6_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz(3)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it

	const res7_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'date', precision: 1, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz(1)[]`,
	);

	// all string variations
	// normal: without timezone
	const res9_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamptz[]`,
	);
	
	const res10_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamptz[]`,
	);
	
	const res12_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115+03']),
		`'{"2025-05-23T12:53:53.115+03"}'::timestamptz[]`,
	);

	const res13_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamptz(5)[]`,
	);
	const res16 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res16_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamptz(5)[]`,
	);

	const res17_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamptz(1)[]`,
	);
	
	const res18_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamptz(1)[]`,
	);
	
	// precision is less than in default, cockroach will store this value trimmed, this should pass since in diff we handle it
	const res20_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamptz(1)[]`,
	);

	// precision same, without UTC
	const res21_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamptz(3)[]`,
	);
	
	// precision same, zero UTC
	const res22_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamptz(3)[]`,
	);
	
	// precision same
	// custom timezone
	const res24_1 = await diffDefault(
		ctx.db,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamptz(1)[]`,
	);

	expect(res5_1).toStrictEqual([]);
	expect(res6_1).toStrictEqual([]);
	expect(res7_1).toStrictEqual([]);
	expect(res9_1).toStrictEqual([]);
	expect(res10_1).toStrictEqual([]);
	expect(res12_1).toStrictEqual([]);
	expect(res13_1).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
	expect(res16_1).toStrictEqual([]);
	expect(res17_1).toStrictEqual([]);
	expect(res18_1).toStrictEqual([]);
	expect(res20_1).toStrictEqual([]);
	expect(res21_1).toStrictEqual([]);
	expect(res22_1).toStrictEqual([]);
	expect(res24_1).toStrictEqual([]);
});

// tests were commented since there are too many of them
test('time', async (ctx) => {
	// normal time without precision
	const res1 = await diffDefault(ctx.db, time().default('15:50:33'), `'15:50:33'`);
	// const res1_1 = await diffDefault(ctx.db, time().default('15:50:33Z'), `'15:50:33Z'`);
	// const res1_2 = await diffDefault(ctx.db, time().default('15:50:33+00'), `'15:50:33+00'`);
	// const res1_3 = await diffDefault(ctx.db, time().default('15:50:33+03'), `'15:50:33+03'`);
	// const res1_4 = await diffDefault(ctx.db, time().default('2025-05-23 15:50:33'), `'2025-05-23 15:50:33'`);
	// const res1_5 = await diffDefault(ctx.db, time().default('2025-05-23 15:50:33Z'), `'2025-05-23 15:50:33Z'`);
	// const res1_6 = await diffDefault(ctx.db, time().default('2025-05-23T15:50:33+00'), `'2025-05-23T15:50:33+00'`);
	// const res1_7 = await diffDefault(ctx.db, time().default('2025-05-23 15:50:33+03'), `'2025-05-23 15:50:33+03'`);
	// const res1_16 = await diffDefault(ctx.db, time().default('15:50:33.123'), `'15:50:33.123'`);
	const res1_17 = await diffDefault(ctx.db, time().default('15:50:33.123Z'), `'15:50:33.123Z'`);

	const res1_8 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33'), `'15:50:33'`);
	// const res1_9 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33Z'), `'15:50:33Z'`);
	// const res1_10 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33+00'), `'15:50:33+00'`);
	// const res1_11 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33+03'), `'15:50:33+03'`);
	// const res1_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).default('2025-05-23 15:50:33'),
	// 	`'2025-05-23 15:50:33'`,
	// );
	// const res1_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).default('2025-05-23 15:50:33Z'),
	// 	`'2025-05-23 15:50:33Z'`,
	// );
	// const res1_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).default('2025-05-23T15:50:33+00'),
	// 	`'2025-05-23T15:50:33+00'`,
	// );
	const res1_20 = await diffDefault(
		ctx.db,
		time({ withTimezone: true, precision: 1 }).default('15:50:33.123+03'),
		`'15:50:33.123+03'`,
	);

	// normal time with precision that is same as in default
	const res2 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123'), `'15:50:33.123'`);
	// const res2_1 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	// const res2_2 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	// const res2_3 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	// const res2_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res2_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res2_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res2_7 = await diffDefault(
		ctx.db,
		time({ precision: 3 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res2_8 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	// const res2_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('15:50:33.123Z'),
	// 	`'15:50:33.123Z'`,
	// );
	// const res2_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('15:50:33.123+00'),
	// 	`'15:50:33.123+00'`,
	// );
	// const res2_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('15:50:33.123+03'),
	// 	`'15:50:33.123+03'`,
	// );
	// const res2_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res2_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res2_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res2_15 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal time with precision that is less than in default
	const res3 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123'), `'15:50:33.123'`);
	// const res3_1 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	// const res3_2 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	// const res3_3 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	// const res3_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res3_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res3_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res3_7 = await diffDefault(
		ctx.db,
		time({ precision: 1 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res3_8 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	// const res3_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('15:50:33.123Z'),
	// 	`'15:50:33.123Z'`,
	// );
	// const res3_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('15:50:33.123+00'),
	// 	`'15:50:33.123+00'`,
	// );
	// const res3_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('15:50:33.123+03'),
	// 	`'15:50:33.123+03'`,
	// );
	// const res3_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res3_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res3_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res3_15 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal time with precision that is bigger than in default
	const res4 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123'), `'15:50:33.123'`);
	// const res4_1 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	// const res4_2 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	// const res4_3 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	// const res4_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res4_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res4_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res4_7 = await diffDefault(
		ctx.db,
		time({ precision: 5 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res4_8 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	// const res4_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('15:50:33.123Z'),
	// 	`'15:50:33.123Z'`,
	// );
	// const res4_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('15:50:33.123+00'),
	// 	`'15:50:33.123+00'`,
	// );
	// const res4_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('15:50:33.123+03'),
	// 	`'15:50:33.123+03'`,
	// );
	// const res4_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res4_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res4_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res4_15 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal array time without precision
	const res5 = await diffDefault(ctx.db, time().array().default(['15:50:33']), `'{15:50:33}'::time[]`);
	// const res5_1 = await diffDefault(ctx.db, time().array().default(['15:50:33Z']), `'{15:50:33Z}'::time[]`);
	// const res5_2 = await diffDefault(ctx.db, time().array().default(['15:50:33+00']), `'{15:50:33+00}'::time[]`);
	// const res5_3 = await diffDefault(ctx.db, time().array().default(['15:50:33+03']), `'{15:50:33+03}'::time[]`);
	// const res5_4 = await diffDefault(
	// 	ctx.db,
	// 	time().array().default(['2025-05-23 15:50:33']),
	// 	`'{2025-05-23 15:50:33}'::time[]`,
	// );
	// const res5_5 = await diffDefault(
	// 	ctx.db,
	// 	time().array().default(['2025-05-23 15:50:33Z']),
	// 	`'{2025-05-23 15:50:33Z}'::time[]`,
	// );
	// const res5_6 = await diffDefault(
	// 	ctx.db,
	// 	time().array().default(['2025-05-23T15:50:33+00']),
	// 	`'{2025-05-23T15:50:33+00}'::time[]`,
	// );
	const res5_7 = await diffDefault(
		ctx.db,
		time().array().default(['2025-05-23 15:50:33+03']),
		`'{2025-05-23 15:50:33+03}'::time[]`,
	);

	const res5_8 = await diffDefault(
		ctx.db,
		time({ withTimezone: true }).array().default(['15:50:33']),
		`'{15:50:33}'::timetz[]`,
	);
	// const res5_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['15:50:33Z']),
	// 	`'{15:50:33Z}'::timetz[]`,
	// );
	// const res5_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['15:50:33+00']),
	// 	`'{15:50:33+00}'::timetz[]`,
	// );
	// const res5_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['15:50:33+03']),
	// 	`'{15:50:33+03}'::timetz[]`,
	// );
	// const res5_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['2025-05-23 15:50:33']),
	// 	`'{2025-05-23 15:50:33}'::timetz[]`,
	// );
	// const res5_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['2025-05-23 15:50:33Z']),
	// 	`'{2025-05-23 15:50:33Z}'::timetz[]`,
	// );
	// const res5_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['2025-05-23T15:50:33+00']),
	// 	`'{2025-05-23T15:50:33+00}'::timetz[]`,
	// );
	const res5_15 = await diffDefault(
		ctx.db,
		time({ withTimezone: true }).array().default(['2025-05-23 15:50:33+03']),
		`'{2025-05-23 15:50:33+03}'::timetz[]`,
	);

	// normal array time with precision that is same as in default
	const res6 = await diffDefault(
		ctx.db,
		time({ precision: 3 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(3)[]`,
	);
	// const res6_1 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::time(3)[]`,
	// );
	// const res6_2 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::time(3)[]`,
	// );
	// const res6_3 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::time(3)[]`,
	// );
	// const res6_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::time(3)[]`,
	// );
	// const res6_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::time(3)[]`,
	// );
	// const res6_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::time(3)[]`,
	// );
	const res6_7 = await diffDefault(
		ctx.db,
		time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(3)[]`,
	);

	const res6_8 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(3)[]`,
	);
	// const res6_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::timetz(3)[]`,
	// );
	// const res6_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::timetz(3)[]`,
	// );
	// const res6_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::timetz(3)[]`,
	// );
	// const res6_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::timetz(3)[]`,
	// );
	// const res6_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::timetz(3)[]`,
	// );
	// const res6_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::timetz(3)[]`,
	// );
	const res6_15 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(3)[]`,
	);

	// normal array time with precision that is less than in default
	const res7 = await diffDefault(
		ctx.db,
		time({ precision: 1 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(1)[]`,
	);
	// const res7_1 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::time(1)[]`,
	// );
	// const res7_2 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::time(1)[]`,
	// );
	// const res7_3 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::time(1)[]`,
	// );
	// const res7_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::time(1)[]`,
	// );
	// const res7_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::time(1)[]`,
	// );
	// const res7_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::time(1)[]`,
	// );
	const res7_7 = await diffDefault(
		ctx.db,
		time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(1)[]`,
	);

	const res7_8 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(1)[]`,
	);
	// const res7_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::timetz(1)[]`,
	// );
	// const res7_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::timetz(1)[]`,
	// );
	// const res7_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::timetz(1)[]`,
	// );
	// const res7_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::timetz(1)[]`,
	// );
	// const res7_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::timetz(1)[]`,
	// );
	// const res7_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::timetz(1)[]`,
	// );
	const res7_15 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(1)[]`,
	);

	// normal array time with precision that is bigger than in default
	const res8 = await diffDefault(
		ctx.db,
		time({ precision: 5 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(5)[]`,
	);
	// const res8_1 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::time(5)[]`,
	// );
	// const res8_2 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::time(5)[]`,
	// );
	// const res8_3 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::time(5)[]`,
	// );
	// const res8_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::time(5)[]`,
	// );
	// const res8_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::time(5)[]`,
	// );
	// const res8_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::time(5)[]`,
	// );
	const res8_7 = await diffDefault(
		ctx.db,
		time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(5)[]`,
	);

	const res8_8 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(5)[]`,
	);
	// const res8_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::timetz(5)[]`,
	// );
	// const res8_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::timetz(5)[]`,
	// );
	// const res8_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::timetz(5)[]`,
	// );
	// const res8_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::timetz(5)[]`,
	// );
	// const res8_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::timetz(5)[]`,
	// );
	// const res8_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::timetz(5)[]`,
	// );
	const res8_15 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(5)[]`,
	);

	expect(res1).toStrictEqual([]);
	// expect(res1_1).toStrictEqual([]);
	// expect(res1_2).toStrictEqual([]);
	// expect(res1_3).toStrictEqual([]);
	// expect(res1_4).toStrictEqual([]);
	// expect(res1_5).toStrictEqual([]);
	// expect(res1_6).toStrictEqual([]);
	// expect(res1_7).toStrictEqual([]);
	expect(res1_8).toStrictEqual([]);
	// expect(res1_9).toStrictEqual([]);
	// expect(res1_10).toStrictEqual([]);
	// expect(res1_11).toStrictEqual([]);
	// expect(res1_12).toStrictEqual([]);
	// expect(res1_13).toStrictEqual([]);
	// expect(res1_14).toStrictEqual([]);
	// expect(res1_16).toStrictEqual([]);
	expect(res1_17).toStrictEqual([]);
	expect(res1_20).toStrictEqual([]);

	expect(res2).toStrictEqual([]);
	// expect(res2_1).toStrictEqual([]);
	// expect(res2_2).toStrictEqual([]);
	// expect(res2_3).toStrictEqual([]);
	// expect(res2_4).toStrictEqual([]);
	// expect(res2_5).toStrictEqual([]);
	// expect(res2_6).toStrictEqual([]);
	expect(res2_7).toStrictEqual([]);
	expect(res2_8).toStrictEqual([]);
	// expect(res2_9).toStrictEqual([]);
	// expect(res2_10).toStrictEqual([]);
	// expect(res2_11).toStrictEqual([]);
	// expect(res2_12).toStrictEqual([]);
	// expect(res2_13).toStrictEqual([]);
	// expect(res2_14).toStrictEqual([]);
	expect(res2_15).toStrictEqual([]);

	expect(res3).toStrictEqual([]);
	// expect(res3_1).toStrictEqual([]);
	// expect(res3_2).toStrictEqual([]);
	// expect(res3_3).toStrictEqual([]);
	// expect(res3_4).toStrictEqual([]);
	// expect(res3_5).toStrictEqual([]);
	// expect(res3_6).toStrictEqual([]);
	expect(res3_7).toStrictEqual([]);
	expect(res3_8).toStrictEqual([]);
	// expect(res3_9).toStrictEqual([]);
	// expect(res3_10).toStrictEqual([]);
	// expect(res3_11).toStrictEqual([]);
	// expect(res3_12).toStrictEqual([]);
	// expect(res3_13).toStrictEqual([]);
	// expect(res3_14).toStrictEqual([]);
	expect(res3_15).toStrictEqual([]);

	expect(res4).toStrictEqual([]);
	// expect(res4_1).toStrictEqual([]);
	// expect(res4_2).toStrictEqual([]);
	// expect(res4_3).toStrictEqual([]);
	// expect(res4_4).toStrictEqual([]);
	// expect(res4_5).toStrictEqual([]);
	// expect(res4_6).toStrictEqual([]);
	expect(res4_7).toStrictEqual([]);
	expect(res4_8).toStrictEqual([]);
	// expect(res4_9).toStrictEqual([]);
	// expect(res4_10).toStrictEqual([]);
	// expect(res4_11).toStrictEqual([]);
	// expect(res4_12).toStrictEqual([]);
	// expect(res4_13).toStrictEqual([]);
	// expect(res4_14).toStrictEqual([]);
	expect(res4_15).toStrictEqual([]);

	expect(res5).toStrictEqual([]);
	// expect(res5_1).toStrictEqual([]);
	// expect(res5_2).toStrictEqual([]);
	// expect(res5_3).toStrictEqual([]);
	// expect(res5_4).toStrictEqual([]);
	// expect(res5_5).toStrictEqual([]);
	// expect(res5_6).toStrictEqual([]);
	expect(res5_7).toStrictEqual([]);
	expect(res5_8).toStrictEqual([]);
	// expect(res5_9).toStrictEqual([]);
	// expect(res5_10).toStrictEqual([]);
	// expect(res5_11).toStrictEqual([]);
	// expect(res5_12).toStrictEqual([]);
	// expect(res5_13).toStrictEqual([]);
	// expect(res5_14).toStrictEqual([]);
	expect(res5_15).toStrictEqual([]);

	expect(res6).toStrictEqual([]);
	// expect(res6_1).toStrictEqual([]);
	// expect(res6_2).toStrictEqual([]);
	// expect(res6_3).toStrictEqual([]);
	// expect(res6_4).toStrictEqual([]);
	// expect(res6_5).toStrictEqual([]);
	// expect(res6_6).toStrictEqual([]);
	expect(res6_7).toStrictEqual([]);
	expect(res6_8).toStrictEqual([]);
	// expect(res6_9).toStrictEqual([]);
	// expect(res6_10).toStrictEqual([]);
	// expect(res6_11).toStrictEqual([]);
	// expect(res6_12).toStrictEqual([]);
	// expect(res6_13).toStrictEqual([]);
	// expect(res6_14).toStrictEqual([]);
	expect(res6_15).toStrictEqual([]);

	expect(res7).toStrictEqual([]);
	// expect(res7_1).toStrictEqual([]);
	// expect(res7_2).toStrictEqual([]);
	// expect(res7_3).toStrictEqual([]);
	// expect(res7_4).toStrictEqual([]);
	// expect(res7_5).toStrictEqual([]);
	// expect(res7_6).toStrictEqual([]);
	expect(res7_7).toStrictEqual([]);
	expect(res7_8).toStrictEqual([]);
	// expect(res7_9).toStrictEqual([]);
	// expect(res7_10).toStrictEqual([]);
	// expect(res7_11).toStrictEqual([]);
	// expect(res7_12).toStrictEqual([]);
	// expect(res7_13).toStrictEqual([]);
	// expect(res7_14).toStrictEqual([]);
	expect(res7_15).toStrictEqual([]);

	expect(res8).toStrictEqual([]);
	// expect(res8_1).toStrictEqual([]);
	// expect(res8_2).toStrictEqual([]);
	// expect(res8_3).toStrictEqual([]);
	// expect(res8_4).toStrictEqual([]);
	// expect(res8_5).toStrictEqual([]);
	// expect(res8_6).toStrictEqual([]);
	expect(res8_7).toStrictEqual([]);
	expect(res8_8).toStrictEqual([]);
	// expect(res8_9).toStrictEqual([]);
	// expect(res8_10).toStrictEqual([]);
	// expect(res8_11).toStrictEqual([]);
	// expect(res8_12).toStrictEqual([]);
	// expect(res8_13).toStrictEqual([]);
	// expect(res8_14).toStrictEqual([]);
	expect(res8_15).toStrictEqual([]);
});

test('time + time arrays', async (ctx) => {
	// normal time without precision
	const res1 = await diffDefault(ctx.db, time().default('15:50:33'), `'15:50:33'`);
	// const res1_1 = await diffDefault(ctx.db, time().default('15:50:33Z'), `'15:50:33Z'`);
	// const res1_2 = await diffDefault(ctx.db, time().default('15:50:33+00'), `'15:50:33+00'`);
	// const res1_3 = await diffDefault(ctx.db, time().default('15:50:33+03'), `'15:50:33+03'`);
	// const res1_4 = await diffDefault(ctx.db, time().default('2025-05-23 15:50:33'), `'2025-05-23 15:50:33'`);
	// const res1_5 = await diffDefault(ctx.db, time().default('2025-05-23 15:50:33Z'), `'2025-05-23 15:50:33Z'`);
	// const res1_6 = await diffDefault(ctx.db, time().default('2025-05-23T15:50:33+00'), `'2025-05-23T15:50:33+00'`);
	// const res1_7 = await diffDefault(ctx.db, time().default('2025-05-23 15:50:33+03'), `'2025-05-23 15:50:33+03'`);
	// const res1_16 = await diffDefault(ctx.db, time().default('15:50:33.123'), `'15:50:33.123'`);
	const res1_17 = await diffDefault(ctx.db, time().default('15:50:33.123Z'), `'15:50:33.123Z'`);

	const res1_8 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33'), `'15:50:33'`);
	// const res1_9 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33Z'), `'15:50:33Z'`);
	// const res1_10 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33+00'), `'15:50:33+00'`);
	// const res1_11 = await diffDefault(ctx.db, time({ withTimezone: true }).default('15:50:33+03'), `'15:50:33+03'`);
	// const res1_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).default('2025-05-23 15:50:33'),
	// 	`'2025-05-23 15:50:33'`,
	// );
	// const res1_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).default('2025-05-23 15:50:33Z'),
	// 	`'2025-05-23 15:50:33Z'`,
	// );
	// const res1_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).default('2025-05-23T15:50:33+00'),
	// 	`'2025-05-23T15:50:33+00'`,
	// );
	const res1_20 = await diffDefault(
		ctx.db,
		time({ withTimezone: true, precision: 1 }).default('15:50:33.123+03'),
		`'15:50:33.123+03'`,
	);

	// normal time with precision that is same as in default
	const res2 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123'), `'15:50:33.123'`);
	// const res2_1 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	// const res2_2 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	// const res2_3 = await diffDefault(ctx.db, time({ precision: 3 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	// const res2_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res2_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res2_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res2_7 = await diffDefault(
		ctx.db,
		time({ precision: 3 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res2_8 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	// const res2_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('15:50:33.123Z'),
	// 	`'15:50:33.123Z'`,
	// );
	// const res2_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('15:50:33.123+00'),
	// 	`'15:50:33.123+00'`,
	// );
	// const res2_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('15:50:33.123+03'),
	// 	`'15:50:33.123+03'`,
	// );
	// const res2_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res2_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res2_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res2_15 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal time with precision that is less than in default
	const res3 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123'), `'15:50:33.123'`);
	// const res3_1 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	// const res3_2 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	// const res3_3 = await diffDefault(ctx.db, time({ precision: 1 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	// const res3_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res3_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res3_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res3_7 = await diffDefault(
		ctx.db,
		time({ precision: 1 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res3_8 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	// const res3_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('15:50:33.123Z'),
	// 	`'15:50:33.123Z'`,
	// );
	// const res3_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('15:50:33.123+00'),
	// 	`'15:50:33.123+00'`,
	// );
	// const res3_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('15:50:33.123+03'),
	// 	`'15:50:33.123+03'`,
	// );
	// const res3_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res3_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res3_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res3_15 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal time with precision that is bigger than in default
	const res4 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123'), `'15:50:33.123'`);
	// const res4_1 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	// const res4_2 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	// const res4_3 = await diffDefault(ctx.db, time({ precision: 5 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	// const res4_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res4_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res4_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res4_7 = await diffDefault(
		ctx.db,
		time({ precision: 5 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res4_8 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	// const res4_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('15:50:33.123Z'),
	// 	`'15:50:33.123Z'`,
	// );
	// const res4_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('15:50:33.123+00'),
	// 	`'15:50:33.123+00'`,
	// );
	// const res4_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('15:50:33.123+03'),
	// 	`'15:50:33.123+03'`,
	// );
	// const res4_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123'),
	// 	`'2025-05-23 15:50:33.123'`,
	// );
	// const res4_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
	// 	`'2025-05-23 15:50:33.123Z'`,
	// );
	// const res4_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
	// 	`'2025-05-23T15:50:33.123+00'`,
	// );
	const res4_15 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal array time without precision
	const res5 = await diffDefault(ctx.db, time().array().default(['15:50:33']), `'{15:50:33}'::time[]`);
	// const res5_1 = await diffDefault(ctx.db, time().array().default(['15:50:33Z']), `'{15:50:33Z}'::time[]`);
	// const res5_2 = await diffDefault(ctx.db, time().array().default(['15:50:33+00']), `'{15:50:33+00}'::time[]`);
	// const res5_3 = await diffDefault(ctx.db, time().array().default(['15:50:33+03']), `'{15:50:33+03}'::time[]`);
	// const res5_4 = await diffDefault(
	// 	ctx.db,
	// 	time().array().default(['2025-05-23 15:50:33']),
	// 	`'{2025-05-23 15:50:33}'::time[]`,
	// );
	// const res5_5 = await diffDefault(
	// 	ctx.db,
	// 	time().array().default(['2025-05-23 15:50:33Z']),
	// 	`'{2025-05-23 15:50:33Z}'::time[]`,
	// );
	// const res5_6 = await diffDefault(
	// 	ctx.db,
	// 	time().array().default(['2025-05-23T15:50:33+00']),
	// 	`'{2025-05-23T15:50:33+00}'::time[]`,
	// );
	const res5_7 = await diffDefault(
		ctx.db,
		time().array().default(['2025-05-23 15:50:33+03']),
		`'{2025-05-23 15:50:33+03}'::time[]`,
	);

	const res5_8 = await diffDefault(
		ctx.db,
		time({ withTimezone: true }).array().default(['15:50:33']),
		`'{15:50:33}'::timetz[]`,
	);
	// const res5_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['15:50:33Z']),
	// 	`'{15:50:33Z}'::timetz[]`,
	// );
	// const res5_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['15:50:33+00']),
	// 	`'{15:50:33+00}'::timetz[]`,
	// );
	// const res5_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['15:50:33+03']),
	// 	`'{15:50:33+03}'::timetz[]`,
	// );
	// const res5_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['2025-05-23 15:50:33']),
	// 	`'{2025-05-23 15:50:33}'::timetz[]`,
	// );
	// const res5_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['2025-05-23 15:50:33Z']),
	// 	`'{2025-05-23 15:50:33Z}'::timetz[]`,
	// );
	// const res5_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ withTimezone: true }).array().default(['2025-05-23T15:50:33+00']),
	// 	`'{2025-05-23T15:50:33+00}'::timetz[]`,
	// );
	const res5_15 = await diffDefault(
		ctx.db,
		time({ withTimezone: true }).array().default(['2025-05-23 15:50:33+03']),
		`'{2025-05-23 15:50:33+03}'::timetz[]`,
	);

	// normal array time with precision that is same as in default
	const res6 = await diffDefault(
		ctx.db,
		time({ precision: 3 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(3)[]`,
	);
	// const res6_1 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::time(3)[]`,
	// );
	// const res6_2 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::time(3)[]`,
	// );
	// const res6_3 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::time(3)[]`,
	// );
	// const res6_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::time(3)[]`,
	// );
	// const res6_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::time(3)[]`,
	// );
	// const res6_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3 }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::time(3)[]`,
	// );
	const res6_7 = await diffDefault(
		ctx.db,
		time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(3)[]`,
	);

	const res6_8 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(3)[]`,
	);
	// const res6_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::timetz(3)[]`,
	// );
	// const res6_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::timetz(3)[]`,
	// );
	// const res6_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::timetz(3)[]`,
	// );
	// const res6_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::timetz(3)[]`,
	// );
	// const res6_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::timetz(3)[]`,
	// );
	// const res6_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 3, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::timetz(3)[]`,
	// );
	const res6_15 = await diffDefault(
		ctx.db,
		time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(3)[]`,
	);

	// normal array time with precision that is less than in default
	const res7 = await diffDefault(
		ctx.db,
		time({ precision: 1 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(1)[]`,
	);
	// const res7_1 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::time(1)[]`,
	// );
	// const res7_2 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::time(1)[]`,
	// );
	// const res7_3 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::time(1)[]`,
	// );
	// const res7_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::time(1)[]`,
	// );
	// const res7_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::time(1)[]`,
	// );
	// const res7_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1 }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::time(1)[]`,
	// );
	const res7_7 = await diffDefault(
		ctx.db,
		time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(1)[]`,
	);

	const res7_8 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(1)[]`,
	);
	// const res7_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::timetz(1)[]`,
	// );
	// const res7_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::timetz(1)[]`,
	// );
	// const res7_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::timetz(1)[]`,
	// );
	// const res7_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::timetz(1)[]`,
	// );
	// const res7_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::timetz(1)[]`,
	// );
	// const res7_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 1, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::timetz(1)[]`,
	// );
	const res7_15 = await diffDefault(
		ctx.db,
		time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(1)[]`,
	);

	// normal array time with precision that is bigger than in default
	const res8 = await diffDefault(
		ctx.db,
		time({ precision: 5 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(5)[]`,
	);
	// const res8_1 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::time(5)[]`,
	// );
	// const res8_2 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::time(5)[]`,
	// );
	// const res8_3 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::time(5)[]`,
	// );
	// const res8_4 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::time(5)[]`,
	// );
	// const res8_5 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::time(5)[]`,
	// );
	// const res8_6 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5 }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::time(5)[]`,
	// );
	const res8_7 = await diffDefault(
		ctx.db,
		time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(5)[]`,
	);

	const res8_8 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(5)[]`,
	);
	// const res8_9 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123Z']),
	// 	`'{15:50:33.123Z}'::timetz(5)[]`,
	// );
	// const res8_10 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123+00']),
	// 	`'{15:50:33.123+00}'::timetz(5)[]`,
	// );
	// const res8_11 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123+03']),
	// 	`'{15:50:33.123+03}'::timetz(5)[]`,
	// );
	// const res8_12 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
	// 	`'{2025-05-23 15:50:33.123}'::timetz(5)[]`,
	// );
	// const res8_13 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
	// 	`'{2025-05-23 15:50:33.123Z}'::timetz(5)[]`,
	// );
	// const res8_14 = await diffDefault(
	// 	ctx.db,
	// 	time({ precision: 5, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
	// 	`'{2025-05-23T15:50:33.123+00}'::timetz(5)[]`,
	// );
	const res8_15 = await diffDefault(
		ctx.db,
		time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(5)[]`,
	);

	expect(res1).toStrictEqual([]);
	// expect(res1_1).toStrictEqual([]);
	// expect(res1_2).toStrictEqual([]);
	// expect(res1_3).toStrictEqual([]);
	// expect(res1_4).toStrictEqual([]);
	// expect(res1_5).toStrictEqual([]);
	// expect(res1_6).toStrictEqual([]);
	// expect(res1_7).toStrictEqual([]);
	expect(res1_8).toStrictEqual([]);
	// expect(res1_9).toStrictEqual([]);
	// expect(res1_10).toStrictEqual([]);
	// expect(res1_11).toStrictEqual([]);
	// expect(res1_12).toStrictEqual([]);
	// expect(res1_13).toStrictEqual([]);
	// expect(res1_14).toStrictEqual([]);
	// expect(res1_16).toStrictEqual([]);
	expect(res1_17).toStrictEqual([]);
	expect(res1_20).toStrictEqual([]);

	expect(res2).toStrictEqual([]);
	// expect(res2_1).toStrictEqual([]);
	// expect(res2_2).toStrictEqual([]);
	// expect(res2_3).toStrictEqual([]);
	// expect(res2_4).toStrictEqual([]);
	// expect(res2_5).toStrictEqual([]);
	// expect(res2_6).toStrictEqual([]);
	expect(res2_7).toStrictEqual([]);
	expect(res2_8).toStrictEqual([]);
	// expect(res2_9).toStrictEqual([]);
	// expect(res2_10).toStrictEqual([]);
	// expect(res2_11).toStrictEqual([]);
	// expect(res2_12).toStrictEqual([]);
	// expect(res2_13).toStrictEqual([]);
	// expect(res2_14).toStrictEqual([]);
	expect(res2_15).toStrictEqual([]);

	expect(res3).toStrictEqual([]);
	// expect(res3_1).toStrictEqual([]);
	// expect(res3_2).toStrictEqual([]);
	// expect(res3_3).toStrictEqual([]);
	// expect(res3_4).toStrictEqual([]);
	// expect(res3_5).toStrictEqual([]);
	// expect(res3_6).toStrictEqual([]);
	expect(res3_7).toStrictEqual([]);
	expect(res3_8).toStrictEqual([]);
	// expect(res3_9).toStrictEqual([]);
	// expect(res3_10).toStrictEqual([]);
	// expect(res3_11).toStrictEqual([]);
	// expect(res3_12).toStrictEqual([]);
	// expect(res3_13).toStrictEqual([]);
	// expect(res3_14).toStrictEqual([]);
	expect(res3_15).toStrictEqual([]);

	expect(res4).toStrictEqual([]);
	// expect(res4_1).toStrictEqual([]);
	// expect(res4_2).toStrictEqual([]);
	// expect(res4_3).toStrictEqual([]);
	// expect(res4_4).toStrictEqual([]);
	// expect(res4_5).toStrictEqual([]);
	// expect(res4_6).toStrictEqual([]);
	expect(res4_7).toStrictEqual([]);
	expect(res4_8).toStrictEqual([]);
	// expect(res4_9).toStrictEqual([]);
	// expect(res4_10).toStrictEqual([]);
	// expect(res4_11).toStrictEqual([]);
	// expect(res4_12).toStrictEqual([]);
	// expect(res4_13).toStrictEqual([]);
	// expect(res4_14).toStrictEqual([]);
	expect(res4_15).toStrictEqual([]);

	expect(res5).toStrictEqual([]);
	// expect(res5_1).toStrictEqual([]);
	// expect(res5_2).toStrictEqual([]);
	// expect(res5_3).toStrictEqual([]);
	// expect(res5_4).toStrictEqual([]);
	// expect(res5_5).toStrictEqual([]);
	// expect(res5_6).toStrictEqual([]);
	expect(res5_7).toStrictEqual([]);
	expect(res5_8).toStrictEqual([]);
	// expect(res5_9).toStrictEqual([]);
	// expect(res5_10).toStrictEqual([]);
	// expect(res5_11).toStrictEqual([]);
	// expect(res5_12).toStrictEqual([]);
	// expect(res5_13).toStrictEqual([]);
	// expect(res5_14).toStrictEqual([]);
	expect(res5_15).toStrictEqual([]);

	expect(res6).toStrictEqual([]);
	// expect(res6_1).toStrictEqual([]);
	// expect(res6_2).toStrictEqual([]);
	// expect(res6_3).toStrictEqual([]);
	// expect(res6_4).toStrictEqual([]);
	// expect(res6_5).toStrictEqual([]);
	// expect(res6_6).toStrictEqual([]);
	expect(res6_7).toStrictEqual([]);
	expect(res6_8).toStrictEqual([]);
	// expect(res6_9).toStrictEqual([]);
	// expect(res6_10).toStrictEqual([]);
	// expect(res6_11).toStrictEqual([]);
	// expect(res6_12).toStrictEqual([]);
	// expect(res6_13).toStrictEqual([]);
	// expect(res6_14).toStrictEqual([]);
	expect(res6_15).toStrictEqual([]);

	expect(res7).toStrictEqual([]);
	// expect(res7_1).toStrictEqual([]);
	// expect(res7_2).toStrictEqual([]);
	// expect(res7_3).toStrictEqual([]);
	// expect(res7_4).toStrictEqual([]);
	// expect(res7_5).toStrictEqual([]);
	// expect(res7_6).toStrictEqual([]);
	expect(res7_7).toStrictEqual([]);
	expect(res7_8).toStrictEqual([]);
	// expect(res7_9).toStrictEqual([]);
	// expect(res7_10).toStrictEqual([]);
	// expect(res7_11).toStrictEqual([]);
	// expect(res7_12).toStrictEqual([]);
	// expect(res7_13).toStrictEqual([]);
	// expect(res7_14).toStrictEqual([]);
	expect(res7_15).toStrictEqual([]);

	expect(res8).toStrictEqual([]);
	// expect(res8_1).toStrictEqual([]);
	// expect(res8_2).toStrictEqual([]);
	// expect(res8_3).toStrictEqual([]);
	// expect(res8_4).toStrictEqual([]);
	// expect(res8_5).toStrictEqual([]);
	// expect(res8_6).toStrictEqual([]);
	expect(res8_7).toStrictEqual([]);
	expect(res8_8).toStrictEqual([]);
	// expect(res8_9).toStrictEqual([]);
	// expect(res8_10).toStrictEqual([]);
	// expect(res8_11).toStrictEqual([]);
	// expect(res8_12).toStrictEqual([]);
	// expect(res8_13).toStrictEqual([]);
	// expect(res8_14).toStrictEqual([]);
	expect(res8_15).toStrictEqual([]);
});

test('date + date arrays', async (ctx) => {
	// dates
	const res1 = await diffDefault(ctx.db, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res1_1 = await diffDefault(
		ctx.db,
		date({ mode: 'date' }).default(new Date('2025-05-23T12:12:31.213')),
		`'2025-05-23'`,
	);
	const res1_2 = await diffDefault(ctx.db, date({ mode: 'date' }).defaultNow(), `now()`);

	const res2 = await diffDefault(ctx.db, date({ mode: 'date' }).array().default([]), `'{}'::date[]`);
	const res2_1 = await diffDefault(ctx.db, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res2_2 = await diffDefault(
		ctx.db,
		date({ mode: 'date' }).default(new Date('2025-05-23T12:12:31.213')),
		`'2025-05-23'`,
	);
	const res2_3 = await diffDefault(ctx.db, date({ mode: 'date' }).defaultNow(), `now()`);

	// strings
	const res3 = await diffDefault(ctx.db, date({ mode: 'string' }).default('2025-05-23'), `'2025-05-23'`);
	const res3_1 = await diffDefault(
		ctx.db,
		date({ mode: 'string' }).default('2025-05-23T12:12:31.213'),
		`'2025-05-23T12:12:31.213'`,
	);
	const res3_2 = await diffDefault(ctx.db, date({ mode: 'string' }).defaultNow(), `now()`);
	const res3_3 = await diffDefault(
		ctx.db,
		date({ mode: 'string' }).default('2025-05-23 12:12:31.213+01:00'),
		`'2025-05-23 12:12:31.213+01:00'`,
	);

	const res4 = await diffDefault(
		ctx.db,
		date({ mode: 'string' }).array().default(['2025-05-23']),
		`'{2025-05-23}'::date[]`,
	);
	const res4_1 = await diffDefault(
		ctx.db,
		date({ mode: 'string' }).array().default(['2025-05-23T12:12:31.213']),
		`'{2025-05-23T12:12:31.213}'::date[]`,
	);
	const res4_2 = await diffDefault(
		ctx.db,
		date({ mode: 'string' }).array().default(['2025-05-23 12:12:31.213+01:00']),
		`'{2025-05-23 12:12:31.213+01:00}'::date[]`,
	);

	expect(res1).toStrictEqual([]);
	expect(res1_1).toStrictEqual([]);
	expect(res1_2).toStrictEqual([]);

	expect(res2).toStrictEqual([]);
	expect(res2_1).toStrictEqual([]);
	expect(res2_2).toStrictEqual([]);
	expect(res2_3).toStrictEqual([]);

	expect(res3).toStrictEqual([]);
	expect(res3_1).toStrictEqual([]);
	expect(res3_2).toStrictEqual([]);
	expect(res3_3).toStrictEqual([]);

	expect(res4).toStrictEqual([]);
	expect(res4_1).toStrictEqual([]);
	expect(res4_2).toStrictEqual([]);
});

// This is not handled the way cockroach stores it
// since user can pass `1 2:3:4` and it will be stored as `1 day 02:03:04`
// so we just compare row values
// | This text is a duplicate from cockroach/grammar.ts |
test('interval + interval arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, interval().default('1 day'), `'1 day'`);
	const res10 = await diffDefault(
		ctx.db,
		interval({ fields: 'day to second', precision: 3 }).default('1 day 3 second'),
		`'1 day 3 second'`,
	);

	const res2 = await diffDefault(ctx.db, interval().array().default([]), `'{}'::interval[]`);
	const res20 = await diffDefault(
		ctx.db,
		interval({ fields: 'day to second', precision: 3 }).array().default([]),
		`'{}'::interval day to second(3)[]`,
	);

	const res3 = await diffDefault(ctx.db, interval().array().default(['1 day']), `'{"1 day"}'::interval[]`);
	const res30 = await diffDefault(
		ctx.db,
		interval({ fields: 'day to second', precision: 3 }).array().default(['1 day 3 second']),
		`'{"1 day 3 second"}'::interval day to second(3)[]`,
	);

	expect(res1).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect(res10.length).toBe(1);
	expect(res2).toStrictEqual([]);
	expect(res20).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect(res30.length).toBe(1);
});

test('enum + enum arrays', async (ctx) => {
	const moodEnum = cockroachEnum('mood_enum', [
		'sad',
		'ok',
		'happy',
		`text'text`,
		`text"text`,
		`text\\text`,
		`text,text`,
		`no,''"\`rm`,
		`mo''",\\\`}{od`,
		`mo''"\\\\\\\`}{od`,
		'mo,\`od',
	]);
	const pre = { moodEnum };

	const res1 = await diffDefault(ctx.db, moodEnum().default('ok'), `'ok'::"mood_enum"`, false, pre);
	const res2 = await diffDefault(ctx.db, moodEnum().default(`text'text`), `e'text\\'text'::"mood_enum"`, false, pre);
	const res3 = await diffDefault(ctx.db, moodEnum().default('text"text'), `'text"text'::"mood_enum"`, false, pre);
	const res4 = await diffDefault(ctx.db, moodEnum().default('text\\text'), `e'text\\\\text'::"mood_enum"`, false, pre);
	const res5 = await diffDefault(ctx.db, moodEnum().default('text,text'), `'text,text'::"mood_enum"`, false, pre);
	const res6 = await diffDefault(
		ctx.db,
		moodEnum().default(`mo''"\\\\\\\`}{od`),
		`e'mo\\'\\'"\\\\\\\\\\\\\`}{od'::"mood_enum"`,
		false,
		pre,
	);

	const res1_1 = await diffDefault(ctx.db, moodEnum().array().default(['ok']), `'{ok}'::"mood_enum"[]`, false, pre);
	const res1_2 = await diffDefault(ctx.db, moodEnum().array().default(['sad']), `'{sad}'::"mood_enum"[]`, false, pre);
	const res2_1 = await diffDefault(
		ctx.db,
		moodEnum().array().default([`text'text`]),
		`'{"text''text"}'::"mood_enum"[]`,
		false,
		pre,
	);
	const res3_1 = await diffDefault(
		ctx.db,
		moodEnum().array().default(['text"text']),
		`'{"text\\"text"}'::"mood_enum"[]`,
		false,
		pre,
	);
	const res4_1 = await diffDefault(
		ctx.db,
		moodEnum().array().default(['text\\text']),
		`'{"text\\\\text"}'::"mood_enum"[]`,
		false,
		pre,
	);
	const res6_1 = await diffDefault(
		ctx.db,
		moodEnum().array().default([`mo''"\\\\\\\`}{od`]),
		`'{"mo''''\\"\\\\\\\\\\\\\`}{od"}'::"mood_enum"[]`,
		false,
		pre,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);

	expect(res1_1).toStrictEqual([]);
	expect(res1_2).toStrictEqual([]);
	expect(res2_1).toStrictEqual([]);
	expect(res3_1).toStrictEqual([]);
	expect(res4_1).toStrictEqual([]);
	expect(res6_1).toStrictEqual([]);
});

test('uuid + uuid arrays', async (ctx) => {
	const res1 = await diffDefault(
		ctx.db,
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		`'550e8400-e29b-41d4-a716-446655440000'`,
	);

	const res2 = await diffDefault(ctx.db, uuid().array().default([]), `'{}'::uuid[]`);

	const res4 = await diffDefault(
		ctx.db,
		uuid().array().default(['550e8400-e29b-41d4-a716-446655440000']),
		`'{550e8400-e29b-41d4-a716-446655440000}'::uuid[]`,
	);

	const res5 = await diffDefault(ctx.db, uuid().defaultRandom(), `gen_random_uuid()`);

	const res6 = await diffDefault(
		ctx.db,
		uuid()
			.array()
			.default(sql`'{550e8400-e29b-41d4-a716-446655440001}'`),
		`'{550e8400-e29b-41d4-a716-446655440001}'::uuid[]`,
	);

	const res7 = await diffDefault(
		ctx.db,
		uuid()
			.array()
			.default(sql`'{550e8400-e29b-41d4-a716-446655440002}'::uuid[]`),
		`'{550e8400-e29b-41d4-a716-446655440002}'::uuid[]`,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
});

test('bit + bit arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, bit().default(`101`), `'101'`);
	const res2 = await diffDefault(ctx.db, bit().default(`1010010010`), `'1010010010'`);

	const res3 = await diffDefault(ctx.db, bit({ length: 4 }).default(`101`), `'101'`);
	const res4 = await diffDefault(ctx.db, bit({ length: 4 }).default(`1010010010`), `'1010010010'`);

	const res5 = await diffDefault(ctx.db, bit().array().default([]), `'{}'::bit[]`);
	const res6 = await diffDefault(ctx.db, bit().array().default([`101`]), `'{101}'::bit[]`);

	const res7 = await diffDefault(ctx.db, bit({ length: 3 }).array().default([]), `'{}'::bit(3)[]`);
	const res8 = await diffDefault(ctx.db, bit({ length: 3 }).array().default([`10110`]), `'{10110}'::bit(3)[]`);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
});

test('varbit + varbit arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, varbit().default(`101`), `'101'`);
	const res2 = await diffDefault(ctx.db, varbit().default(`1010010010`), `'1010010010'`);

	const res3 = await diffDefault(ctx.db, varbit({ length: 4 }).default(`101`), `'101'`);
	const res4 = await diffDefault(ctx.db, varbit({ length: 4 }).default(`1010010010`), `'1010010010'`);

	const res5 = await diffDefault(ctx.db, varbit().array().default([]), `'{}'::varbit[]`);
	const res6 = await diffDefault(ctx.db, varbit().array().default([`101`]), `'{101}'::varbit[]`);

	const res7 = await diffDefault(ctx.db, varbit({ length: 3 }).array().default([]), `'{}'::varbit(3)[]`);
	const res8 = await diffDefault(ctx.db, varbit({ length: 3 }).array().default([`10110`]), `'{10110}'::varbit(3)[]`);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res7).toStrictEqual([]);
	expect(res8).toStrictEqual([]);
});

test('vector + vector arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, vector({ dimensions: 3 }).default([0, -2, 3]), `'[0,-2,3]'`);
	const res2 = await diffDefault(ctx.db, vector({ dimensions: 1 }).default([0.0]), `'[0]'`);
	const res3 = await diffDefault(
		ctx.db,
		vector({ dimensions: 5 }).default([0.0, 1.321, 5.21, 521.4, 4.0]),
		`'[0,1.321,5.21,521.4,4]'`,
	);
	const res4 = await diffDefault(
		ctx.db,
		vector({ dimensions: 3 }).default([0, -2.12345, 3.123456]),
		`'[0,-2.12345,3.123456]'`,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
});

test('inet + inet arrays', async (ctx) => {
	const res1 = await diffDefault(ctx.db, inet().default('127.0.0.1'), `'127.0.0.1'`);
	const res2 = await diffDefault(ctx.db, inet().default('::ffff:192.168.0.1/96'), `'::ffff:192.168.0.1/96'`);

	const res1_1 = await diffDefault(ctx.db, inet().array().default(['127.0.0.1']), `'{127.0.0.1}'::inet[]`);
	const res2_1 = await diffDefault(
		ctx.db,
		inet().array().default(['::ffff:192.168.0.1/96']),
		`'{::ffff:192.168.0.1/96}'::inet[]`,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);

	expect(res1_1).toStrictEqual([]);
	expect(res2_1).toStrictEqual([]);
});

// postgis extension
// SRID=4326 -> these coordinates are longitude/latitude values
test('geometry + geometry arrays', async (ctx) => {
	const res1 = await diffDefault(
		ctx.db,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).default([30.5234, 50.4501]),
		`'SRID=4326;POINT(30.5234 50.4501)'`,
		undefined,
		undefined,
	);

	const res2 = await diffDefault(
		ctx.db,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }),
		`'SRID=4326;POINT(30.5234 50.4501)'`,
		undefined,
		undefined,
	);

	const res3 = await diffDefault(
		ctx.db,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([]),
		`'{}'::geometry(point,4326)[]`,
		undefined,
		undefined,
	);
	const res4 = await diffDefault(
		ctx.db,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([[30.5234, 50.4501]]),
		`'{SRID=4326;POINT(30.5234 50.4501)}'::geometry(point,4326)[]`,
		undefined,
		undefined,
	);

	const res5 = await diffDefault(
		ctx.db,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([]),
		`'{}'::geometry(point,4326)[]`,
		undefined,
		undefined,
	);
	const res6 = await diffDefault(
		ctx.db,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([{ x: 30.5234, y: 50.4501 }]),
		`'{SRID=4326;POINT(30.5234 50.4501)}'::geometry(point,4326)[]`,
		undefined,
		undefined,
	);

	const res11 = await diffDefault(
		ctx.db,
		geometry({ mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }),
		`'POINT(30.5234 50.4501)'`,
		undefined,
		undefined,
	);

	const res12 = await diffDefault(
		ctx.db,
		geometry({ mode: 'xy', type: 'point' }).default(sql`'SRID=4326;POINT(10 10)'`),
		`'SRID=4326;POINT(10 10)'`,
		undefined,
		undefined,
	);

	const res13 = await diffDefault(
		ctx.db,
		geometry({ mode: 'xy', type: 'point' }).array().default([{ x: 13, y: 13 }]),
		`'{POINT(13 13)}'::geometry(point)[]`,
		undefined,
		undefined,
	);

	const res15 = await diffDefault(
		ctx.db,
		geometry({ mode: 'xy', type: 'point' }).array().default(sql`'{SRID=4326;POINT(15 15)}'::geometry(point)[]`),
		`'{SRID=4326;POINT(15 15)}'::geometry(point)[]`,
		undefined,
		undefined,
	);

	const res16 = await diffDefault(
		ctx.db,
		geometry({ mode: 'xy', type: 'point' }).array().default(sql`'{POINT(15 15)}'::geometry(point)[]`),
		`'{POINT(15 15)}'::geometry(point)[]`,
		undefined,
		undefined,
	);

	expect(res1).toStrictEqual([]);
	expect(res2).toStrictEqual([]);
	expect(res3).toStrictEqual([]);
	expect(res4).toStrictEqual([]);
	expect(res5).toStrictEqual([]);
	expect(res6).toStrictEqual([]);
	expect(res11).toStrictEqual([]);
	expect(res12).toStrictEqual([]);
	expect(res13).toStrictEqual([]);
	expect(res15).toStrictEqual([]);
	expect(res16).toStrictEqual([]);
});
