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
import { DB } from 'src/utils';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { diffDefault, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase(false);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

test('int4', async () => {
	const res1 = await diffDefault(_, int4().default(10), '10');
	const res2 = await diffDefault(_, int4().default(0), '0');
	const res3 = await diffDefault(_, int4().default(-10), '-10');
	const res4 = await diffDefault(_, int4().default(1e4), '10000');
	const res5 = await diffDefault(_, int4().default(-1e4), '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('int4 arrays', async () => {
	const res1 = await diffDefault(_, int4().array().default([]), "'{}'::int4[]");
	const res2 = await diffDefault(_, int4().array().default([10]), "'{10}'::int4[]");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('smallint', async () => {
	// 2^15 - 1
	const res1 = await diffDefault(_, smallint().default(32767), '32767');
	// -2^15
	const res2 = await diffDefault(_, smallint().default(-32768), '-32768');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('smallint arrays', async () => {
	const res1 = await diffDefault(_, smallint().array().default([]), "'{}'::int2[]");
	const res2 = await diffDefault(_, smallint().array().default([32767]), "'{32767}'::int2[]");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('bigint', async () => {
	// 2^53
	const res1 = await diffDefault(_, int8({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res2 = await diffDefault(_, int8({ mode: 'number' }).default(-9007199254740991), '-9007199254740991');
	// 2^63 - 1
	const res3 = await diffDefault(_, bigint({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807');
	// -2^63
	const res4 = await diffDefault(_, bigint({ mode: 'bigint' }).default(-9223372036854775808n), '-9223372036854775808');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('bigint arrays', async () => {
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).array().default([]), "'{}'::int8[]");
	const res2 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default([]), "'{}'::int8[]");

	const res3 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array().default([9007199254740991]),
		"'{9007199254740991}'::int8[]",
	);
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().default([9223372036854775807n]),
		"'{9223372036854775807}'::int8[]",
	);

	const res9 = await diffDefault(_, bigint({ mode: 'number' }).array().default([1, 2]), "'{1,2}'::int8[]");
	const res10 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default([1n, 2n]), "'{1,2}'::int8[]");

	const res13 = await diffDefault(
		_,
		bigint({ mode: 'bigint' })
			.array()
			.default(sql`'{}'`),
		"'{}'::int8[]",
	);
	const res14 = await diffDefault(
		_,
		bigint({ mode: 'bigint' })
			.array()
			.default(sql`'{}'::int8[]`),
		"'{}'::int8[]",
	);
	const res15 = await diffDefault(
		_,
		bigint({ mode: 'bigint' })
			.array()
			.default(sql`'{9223372036854775807}'::int8[]`),
		"'{9223372036854775807}'::int8[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), '10.123');

	const res4 = await diffDefault(_, numeric({ mode: 'string' }).default('10.123'), '10.123');
	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807');
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');

	const res5 = await diffDefault(_, numeric({ precision: 6 }).default('10.123'), '10.123');
	const res6 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.123'), '10.123');

	const res7 = await diffDefault(_, numeric({ precision: 6 }).default('10'), '10');
	const res8 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10'), '10');

	const res7_1 = await diffDefault(_, numeric({ precision: 6 }).default('10.100'), '10.100');
	const res8_1 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.100'), '10.100');
	const res7_2 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10.1), '10.1'); // js trims .100 to 0.1
	const res8_2 = await diffDefault(_, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.1), '10.1'); // js trims .100 to 0.1

	const res9 = await diffDefault(_, numeric({ mode: 'string', scale: 2 }).default('10.123'), '10.123');
	const res10 = await diffDefault(_, numeric({ mode: 'string', precision: 6 }).default('10.123'), '10.123');
	const res11 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), '10.123');

	const res12 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'9223372036854775807',
	);
	const res13 = await diffDefault(_, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '10.123');
	const res14 = await diffDefault(_, numeric({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res15 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10.123), '10.123');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res7_1).toStrictEqual([]);
	expect.soft(res8_1).toStrictEqual([]);
	expect.soft(res7_2).toStrictEqual([]);
	expect.soft(res8_2).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('numeric arrays', async () => {
	const res1 = await diffDefault(_, numeric({ mode: 'number' }).array().default([]), "'{}'::decimal[]");
	const res2 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);
	const res3 = await diffDefault(_, numeric({ mode: 'bigint' }).array().default([]), "'{}'::decimal[]");
	const res4 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::decimal(4)[]",
	);
	const res5 = await diffDefault(_, numeric({ mode: 'string' }).array().default([]), "'{}'::decimal[]");
	const res6 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res7_1 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res7_2 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.153]),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res7_3 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_4 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 3 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_5 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 3 }).array().default([10, 123]),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res8_1 = await diffDefault(
		_,
		numeric({ mode: 'string' }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res8_2 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.153']),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res8_3 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_4 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 3 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_5 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 3 }).array().default(['10', '123']),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res9_1 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal[]",
	);

	// scale will be 0
	// default will be trimmed to integer part
	const res9_2 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(19)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res9_3 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 23, scale: 3 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(23,3)[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);

	expect.soft(res7_1).toStrictEqual([]);
	expect.soft(res7_2).toStrictEqual([]);
	expect.soft(res7_3).toStrictEqual([]);
	expect.soft(res7_4).toStrictEqual([]);
	expect.soft(res7_5).toStrictEqual([]);

	expect.soft(res8_1).toStrictEqual([]);
	expect.soft(res8_2).toStrictEqual([]);
	expect.soft(res8_3).toStrictEqual([]);
	expect.soft(res8_4).toStrictEqual([]);
	expect.soft(res8_5).toStrictEqual([]);

	expect.soft(res9_1).toStrictEqual([]);
	expect.soft(res9_2).toStrictEqual([]);
	expect.soft(res9_3).toStrictEqual([]);
});

test('decimal', async () => {
	const res1 = await diffDefault(_, decimal().default('10.123'), '10.123');

	const res4 = await diffDefault(_, decimal({ mode: 'string' }).default('10.123'), '10.123');
	const res2 = await diffDefault(_, decimal({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807');
	const res3 = await diffDefault(_, decimal({ mode: 'number' }).default(9007199254740991), '9007199254740991');

	const res5 = await diffDefault(_, decimal({ precision: 6 }).default('10.123'), '10.123');
	const res6 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10.123'), '10.123');

	const res7 = await diffDefault(_, decimal({ precision: 6 }).default('10'), '10');
	const res8 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10'), '10');

	const res7_1 = await diffDefault(_, decimal({ precision: 6 }).default('10.100'), '10.100');
	const res8_1 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10.100'), '10.100');
	const res7_2 = await diffDefault(_, decimal({ mode: 'number', precision: 6 }).default(10.1), '10.1'); // js trims .100 to 0.1
	const res8_2 = await diffDefault(_, decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.1), '10.1'); // js trims .100 to 0.1

	const res9 = await diffDefault(_, decimal({ mode: 'string', scale: 2 }).default('10.123'), '10.123');
	const res10 = await diffDefault(_, decimal({ mode: 'string', precision: 6 }).default('10.123'), '10.123');
	const res11 = await diffDefault(_, decimal({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), '10.123');

	const res12 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'9223372036854775807',
	);
	const res13 = await diffDefault(_, decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '10.123');
	const res14 = await diffDefault(_, decimal({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res15 = await diffDefault(_, decimal({ mode: 'number', precision: 6 }).default(10.123), '10.123');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res7_1).toStrictEqual([]);
	expect.soft(res8_1).toStrictEqual([]);
	expect.soft(res7_2).toStrictEqual([]);
	expect.soft(res8_2).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('decimals arrays', async () => {
	const res1 = await diffDefault(_, decimal({ mode: 'number' }).array().default([]), "'{}'::decimal[]");
	const res2 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);
	const res3 = await diffDefault(_, decimal({ mode: 'bigint' }).array().default([]), "'{}'::decimal[]");
	const res4 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::decimal(4)[]",
	);
	const res5 = await diffDefault(_, decimal({ mode: 'string' }).array().default([]), "'{}'::decimal[]");
	const res6 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res7_1 = await diffDefault(
		_,
		decimal({ mode: 'number' }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res7_2 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.153]),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res7_3 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 6 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_4 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 6, scale: 3 }).array().default([10.123, 123.1]),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res7_5 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 6, scale: 3 }).array().default([10, 123]),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res8_1 = await diffDefault(
		_,
		decimal({ mode: 'string' }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal[]",
	);
	// scale exists and less then decimal part
	// default will be trimmed by scale
	const res8_2 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.153']),
		"'{10.123,123.153}'::decimal(6,2)[]",
	);
	// scale will be 0
	// default will be trimmed to integer part
	const res8_3 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_4 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6, scale: 3 }).array().default(['10.123', '123.1']),
		"'{10.123,123.1}'::decimal(6,3)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res8_5 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6, scale: 3 }).array().default(['10', '123']),
		"'{10,123}'::decimal(6,3)[]",
	);

	// no precision and scale
	// default will be created same as passed
	const res9_1 = await diffDefault(
		_,
		decimal({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal[]",
	);

	// scale will be 0
	// default will be trimmed to integer part
	const res9_2 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(19)[]",
	);
	// scale exists and is bigger then decimal part
	// default will be padded by scale
	const res9_3 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 23, scale: 3 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(23,3)[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);

	expect.soft(res7_1).toStrictEqual([]);
	expect.soft(res7_2).toStrictEqual([]);
	expect.soft(res7_3).toStrictEqual([]);
	expect.soft(res7_4).toStrictEqual([]);
	expect.soft(res7_5).toStrictEqual([]);

	expect.soft(res8_1).toStrictEqual([]);
	expect.soft(res8_2).toStrictEqual([]);
	expect.soft(res8_3).toStrictEqual([]);
	expect.soft(res8_4).toStrictEqual([]);
	expect.soft(res8_5).toStrictEqual([]);

	expect.soft(res9_1).toStrictEqual([]);
	expect.soft(res9_2).toStrictEqual([]);
	expect.soft(res9_3).toStrictEqual([]);
});

test('real + real arrays', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');
	const res1_0 = await diffDefault(_, real().default(1000), '1000');
	const res1_1 = await diffDefault(_, real().default(1000.3), '1000.3');

	const res2 = await diffDefault(_, real().array().default([]), `'{}'::real[]`);
	const res3 = await diffDefault(_, real().array().default([1000.123, 10.2]), `'{1000.123,10.2}'::real[]`);
	const res4 = await diffDefault(_, real().array().default([1000.2]), `'{1000.2}'::real[]`);
	const res5 = await diffDefault(_, real().array().default([1000.123, 10]), `'{1000.123,10}'::real[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_0).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('float + float arrays', async () => {
	const res1 = await diffDefault(_, float().default(10000.123), '10000.123');
	const res1_0 = await diffDefault(_, float().default(10000), '10000');
	const res1_1 = await diffDefault(_, float().default(1000.3), '1000.3');

	const res2 = await diffDefault(_, float().array().default([]), `'{}'::float[]`);
	const res3 = await diffDefault(_, float().array().default([10000.123]), `'{10000.123}'::float[]`);
	const res30 = await diffDefault(_, float().array().default([10000, 14]), `'{10000,14}'::float[]`);
	const res4 = await diffDefault(_, float().array().default([1000.2]), `'{1000.2}'::float[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_0).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
});

test('doublePrecision + doublePrecision arrays', async () => {
	const res1 = await diffDefault(_, doublePrecision().default(10000.123), '10000.123');
	const res1_0 = await diffDefault(_, doublePrecision().default(10000), '10000');
	const res1_1 = await diffDefault(_, doublePrecision().default(1000.3), '1000.3');

	const res2 = await diffDefault(_, doublePrecision().array().default([]), `'{}'::float[]`);
	const res3 = await diffDefault(_, doublePrecision().array().default([10000.123]), `'{10000.123}'::float[]`);
	const res3_0 = await diffDefault(_, doublePrecision().array().default([10000, 14]), `'{10000,14}'::float[]`);
	const res4 = await diffDefault(_, doublePrecision().array().default([1000.2]), `'{1000.2}'::float[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_0).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_0).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('bool + bool arrays', async () => {
	const res1 = await diffDefault(_, bool().default(true), 'true');
	const res2 = await diffDefault(_, bool().default(false), 'false');
	const res3 = await diffDefault(_, bool().default(sql`true`), 'true');

	const res4 = await diffDefault(_, bool().array().default([]), `'{}'::bool[]`);
	const res5 = await diffDefault(_, bool().array().default([true]), `'{true}'::bool[]`);

	const res6 = await diffDefault(
		_,
		bool()
			.array()
			.default(sql`'{true}'::bool[]`),
		`'{true}'::bool[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('char + char arrays', async () => {
	const res1 = await diffDefault(_, char().default('text'), `'text'`);
	const res1_0 = await diffDefault(_, char().default('text'), `'text'`);
	const res2 = await diffDefault(_, char({ length: 15 }).default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(_, char({ length: 15 }).default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, char({ length: 15 }).default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(_, char({ length: 15, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5_1 = await diffDefault(_, char({ length: 15 }).default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, char({ length: 15 }).array().default([]), `'{}'::char(15)[]`);
	const res8 = await diffDefault(_, char({ length: 15 }).array().default(['text']), `'{text}'::char(15)[]`);
	const res8_0 = await diffDefault(_, char().array().default(['text']), `'{text}'::char[]`);

	// char is bigger than default
	const res9 = await diffDefault(_, char({ length: 15 }).default('text'), `'text'`);
	// char is less than default
	const res10 = await diffDefault(_, char({ length: 2 }).default('text'), `'text'`);
	// char is same as default
	const res11 = await diffDefault(_, char({ length: 2 }).default('12'), `'12'`);

	const res12 = await diffDefault(_, char({ length: 15 }).array().default(['\\']), `'{"\\\\"}'::char(15)[]`);
	const res13 = await diffDefault(_, char({ length: 15 }).array().default(["'"]), `'{''}'::char(15)[]`);
	const res14 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::char(15)[]`,
	);
	const res15 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::char(15)[]`,
	);

	const res16 = await diffDefault(_, char({ length: 15 }).array().default([]), `'{}'::char(15)[]`);

	// char is bigger than default
	const res17 = await diffDefault(_, char({ length: 15 }).array().default(['text']), `'{text}'::char(15)[]`);
	// char is less than default
	const res18 = await diffDefault(_, char({ length: 2 }).array().default(['text']), `'{text}'::char(2)[]`);
	const res18_1 = await diffDefault(_, char({ length: 2 }).array().default(["t'"]), `'{t''}'::char(2)[]`);

	const res18_2 = await diffDefault(_, char({ length: 2 }).array().default(['t\\']), `'{"t\\\\"}'::char(2)[]`);
	// char is same as default
	const res19 = await diffDefault(_, char({ length: 2 }).array().default(['12']), `'{12}'::char(2)[]`);

	// char ends with '
	const res20 = await diffDefault(_, char({ length: 5 }).array().default(["1234'4"]), `'{1234''4}'::char(5)[]`);
	// char ends with \
	const res21 = await diffDefault(_, char({ length: 5 }).array().default(['1234\\1']), `'{"1234\\\\1"}'::char(5)[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_0).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res8_0).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res18_1).toStrictEqual([]);
	expect.soft(res18_2).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
});

test('varchar + varchar arrays', async () => {
	const res1 = await diffDefault(_, varchar({ length: 255 }).default('text'), `'text'`);
	const res1_0 = await diffDefault(_, varchar().default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 255 }).default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(_, varchar({ length: 255 }).default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, varchar({ length: 255 }).default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(_, varchar({ length: 255, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5_1 = await diffDefault(_, varchar({ length: 255 }).default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		varchar({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, varchar({ length: 255 }).array().default([]), `'{}'::varchar(255)[]`);
	const res8 = await diffDefault(_, varchar({ length: 255 }).array().default(['text']), `'{text}'::varchar(255)[]`);
	const res8_0 = await diffDefault(_, varchar().array().default(['text']), `'{text}'::varchar[]`);

	// varchar length is bigger than default
	const res9 = await diffDefault(_, varchar({ length: 15 }).default('text'), `'text'`);
	// varchar length is less than default
	const res10 = await diffDefault(_, varchar({ length: 2 }).default('text'), `'text'`, true);
	// varchar length is same as default
	const res11 = await diffDefault(_, varchar({ length: 2 }).default('12'), `'12'`);

	const res12 = await diffDefault(_, varchar({ length: 15 }).array().default(['\\']), `'{"\\\\"}'::varchar(15)[]`);
	const res13 = await diffDefault(_, varchar({ length: 15 }).array().default(["'"]), `'{''}'::varchar(15)[]`);
	const res14 = await diffDefault(
		_,
		varchar({ length: 15, enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::varchar(15)[]`,
	);
	const res15 = await diffDefault(
		_,
		varchar({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::varchar(255)[]`,
	);

	const res16 = await diffDefault(_, varchar({ length: 255 }).array().default([]), `'{}'::varchar(255)[]`);

	// char is bigger than default
	const res17 = await diffDefault(_, varchar({ length: 255 }).array().default(['text']), `'{text}'::varchar(255)[]`);
	// char is less than default
	const res18 = await diffDefault(_, varchar({ length: 2 }).array().default(['text']), `'{text}'::varchar(2)[]`);
	const res18_1 = await diffDefault(_, varchar({ length: 2 }).array().default(["t'"]), `'{t''}'::varchar(2)[]`);

	const res18_2 = await diffDefault(_, varchar({ length: 2 }).array().default(['t\\']), `'{"t\\\\"}'::varchar(2)[]`);
	// char is same as default
	const res19 = await diffDefault(_, varchar({ length: 2 }).array().default(['12']), `'{12}'::varchar(2)[]`);

	// char ends with '
	const res20 = await diffDefault(_, varchar({ length: 5 }).array().default(["1234'4"]), `'{1234''4}'::varchar(5)[]`);
	// char ends with \
	const res21 = await diffDefault(
		_,
		varchar({ length: 5 }).array().default(['1234\\1']),
		`'{"1234\\\\1"}'::varchar(5)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_0).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res8_0).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([`Insert default failed`]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res18_1).toStrictEqual([]);
	expect.soft(res18_2).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
});

test('text + text arrays', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(_, text().default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, text().default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(_, text().default('one'), "'one'");
	const res5_1 = await diffDefault(_, text().default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, text().array().default([]), `'{}'::string[]`);
	const res8 = await diffDefault(_, text().array().default(['text']), `'{text}'::string[]`);

	const res12 = await diffDefault(_, text().array().default(['\\']), `'{"\\\\"}'::string[]`);
	const res13 = await diffDefault(_, text().array().default(["'"]), `'{''}'::string[]`);
	const res14 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::string[]`,
	);
	const res15 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::string[]`,
	);

	const res16 = await diffDefault(_, text().array().default([]), `'{}'::string[]`);

	const res18 = await diffDefault(_, text().array().default(['text']), `'{text}'::string[]`);
	const res18_1 = await diffDefault(_, text().array().default(["t'"]), `'{t''}'::string[]`);

	const res18_2 = await diffDefault(_, text().array().default(['t\\']), `'{"t\\\\"}'::string[]`);

	const res20 = await diffDefault(_, text().array().default(["1234'4"]), `'{1234''4}'::string[]`);
	const res21 = await diffDefault(
		_,
		text().array().default(['1234\\1']),
		`'{"1234\\\\1"}'::string[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res18_1).toStrictEqual([]);
	expect.soft(res18_2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
});

test('string + string arrays', async () => {
	const res1 = await diffDefault(_, string({ length: 255 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, string({ length: 255 }).default("text'text"), `e'text\\'text'`);
	const res3 = await diffDefault(_, string({ length: 255 }).default('text\'text"'), `e'text\\'text"'`);
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, string({ length: 255 }).default(`mo''",\\\`}{od`), `e'mo\\'\\'",\\\\\`}{od'`);
	const res5 = await diffDefault(_, string({ length: 255, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5_1 = await diffDefault(_, string({ length: 255 }).default('hello, world'), "'hello, world'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		string({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`e'mo\\'\\'",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, string({ length: 255 }).array().default([]), `'{}'::string(255)[]`);
	const res8 = await diffDefault(_, string({ length: 255 }).array().default(['text']), `'{text}'::string(255)[]`);
	const res8_0 = await diffDefault(_, string().array().default(['text']), `'{text}'::string[]`);

	// varchar length is bigger than default
	const res9 = await diffDefault(_, string({ length: 15 }).default('text'), `'text'`);
	// varchar length is less than default
	const res10 = await diffDefault(_, string({ length: 2 }).default('text'), `'text'`, true);
	// varchar length is same as default
	const res11 = await diffDefault(_, string({ length: 2 }).default('12'), `'12'`);

	const res12 = await diffDefault(_, string({ length: 15 }).array().default(['\\']), `'{"\\\\"}'::string(15)[]`);
	const res13 = await diffDefault(_, string({ length: 15 }).array().default(["'"]), `'{''}'::string(15)[]`);
	const res14 = await diffDefault(
		_,
		string({ length: 15, enum: ['one', 'two', 'three'] })
			.array()
			.default(['one']),
		`'{one}'::string(15)[]`,
	);
	const res15 = await diffDefault(
		_,
		string({ length: 255, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`}{od"}'::string(255)[]`,
	);

	const res16 = await diffDefault(_, string({ length: 255 }).array().default([]), `'{}'::string(255)[]`);

	// char is bigger than default
	const res17 = await diffDefault(_, string({ length: 255 }).array().default(['text']), `'{text}'::string(255)[]`);
	// char is less than default
	const res18 = await diffDefault(_, string({ length: 2 }).array().default(['text']), `'{text}'::string(2)[]`);
	const res18_1 = await diffDefault(_, string({ length: 2 }).array().default(["t'"]), `'{t''}'::string(2)[]`);

	const res18_2 = await diffDefault(_, string({ length: 2 }).array().default(['t\\']), `'{"t\\\\"}'::string(2)[]`);
	// char is same as default
	const res19 = await diffDefault(_, string({ length: 2 }).array().default(['12']), `'{12}'::string(2)[]`);

	// char ends with '
	const res20 = await diffDefault(_, string({ length: 5 }).array().default(["1234'4"]), `'{1234''4}'::string(5)[]`);
	// char ends with \
	const res21 = await diffDefault(
		_,
		string({ length: 5 }).array().default(['1234\\1']),
		`'{"1234\\\\1"}'::string(5)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res8_0).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([`Insert default failed`]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res18_1).toStrictEqual([]);
	expect.soft(res18_2).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
});

test('jsonb', async () => {
	const res1 = await diffDefault(_, jsonb().default({}), `'{}'`);
	const res2 = await diffDefault(_, jsonb().default([]), `'[]'`);
	const res3 = await diffDefault(_, jsonb().default([1, 2, 3]), `'[1, 2, 3]'`);
	const res4 = await diffDefault(_, jsonb().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, jsonb().default({ key: "val'ue" }), `e'{"key":"val\\'ue"}'`);
	const res6 = await diffDefault(_, jsonb().default({ key: `mo''",\`}{od` }), `e'{"key":"mo\\'\\'\\\\",\`}{od"}'`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	await expect.soft(diffDefault(_, jsonb().default({ key: 'mo",\\`}{od' }), `e'{"key":"mo\\",\\\`}{od"}'`)).rejects
		.toThrowError();
});

test('timestamp + timestamp arrays', async () => {
	// all dates variations

	// normal without timezone
	const res1 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res1_1 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);

	// precision same as in default
	const res2 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3 }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp(3)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	const res3 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 1 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res3_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 1 }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp(1)[]`,
	);
	// precision is bigger than in default
	// cockroach will not pad it
	const res4 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 5 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res4_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 5 }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp(5)[]`,
	);

	// all string variations
	// normal: without timezone
	const res9 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res9_1 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp[]`,
	);
	// normal: timezone with "zero UTC offset" in the end
	const res10 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res10_1 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp[]`,
	);
	// normal: timezone with "+00" in the end
	const res11 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res11_1 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp[]`,
	);
	// normal: timezone with custom timezone
	const res12 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23T12:53:53.115+03'),
		`'2025-05-23T12:53:53.115+03'`,
	);
	const res12_1 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23T12:53:53.115+03']),
		`'{"2025-05-23T12:53:53.115+03"}'::timestamp[]`,
	);

	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// without UTC
	const res13 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res13_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(1)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// zero UTC
	const res14 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res14_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(1)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// +00
	const res15 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res15_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp(1)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// custom timezone
	const res16 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res16_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1 }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(1)[]`,
	);

	// precision same
	// No timezone
	const res17 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res17_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(3)[]`,
	);
	// precision same
	// zero timezone
	const res18 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res18_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(3)[]`,
	);
	// precision same
	// +00
	const res19 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res19_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp(3)[]`,
	);
	// precision same
	// custom timezone
	const res20 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res20_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3 }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(3)[]`,
	);

	// precision is bigget than in default
	// No timezone
	const res21 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res21_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(5)[]`,
	);
	// precision is bigget than in default
	// zero timezone
	const res22 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res22_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(5)[]`,
	);
	// precision is bigget than in default
	// +00
	const res23 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res23_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp(5)[]`,
	);
	// precision is bigget than in default
	// custom timezone
	const res24 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res24_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5 }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(5)[]`,
	);

	const res25 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).defaultNow(),
		`now()`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res4_1).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res9_1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res10_1).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res11_1).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res12_1).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res13_1).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res14_1).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res15_1).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res16_1).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res17_1).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res18_1).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res19_1).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res20_1).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
	expect.soft(res21_1).toStrictEqual([]);
	expect.soft(res22).toStrictEqual([]);
	expect.soft(res22_1).toStrictEqual([]);
	expect.soft(res23).toStrictEqual([]);
	expect.soft(res23_1).toStrictEqual([]);
	expect.soft(res24).toStrictEqual([]);
	expect.soft(res24_1).toStrictEqual([]);
	expect.soft(res25).toStrictEqual([]);
});

test('timestamptz + timestamptz arrays', async () => {
	// all dates variations

	// normal with timezone
	const res5 = await diffDefault(
		_,
		timestamp({ mode: 'date', withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res5_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', withTimezone: true }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz[]`,
	);
	// precision same as in default
	const res6 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res6_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz(3)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	const res7 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 1, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res7_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 1, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz(1)[]`,
	);
	// precision is bigger than in default
	// cockroach will not pad it
	const res8 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 5, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res8_1 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 5, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamptz(5)[]`,
	);

	// all string variations
	// normal: without timezone
	const res9 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res9_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamptz[]`,
	);
	// normal: timezone with "zero UTC offset" in the end
	const res10 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res10_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamptz[]`,
	);
	// normal: timezone with "+00" in the end
	const res11 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res11_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamptz[]`,
	);
	// normal: timezone with custom timezone
	const res12 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).default('2025-05-23T12:53:53.115+03'),
		`'2025-05-23T12:53:53.115+03'`,
	);
	const res12_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', withTimezone: true }).array().default(['2025-05-23T12:53:53.115+03']),
		`'{"2025-05-23T12:53:53.115+03"}'::timestamptz[]`,
	);

	// precision is bigger than in default
	// cockroach will not pad this
	// without UTC
	const res13 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res13_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamptz(5)[]`,
	);
	// precision is bigger than in default
	// cockroach will not pad this
	// this should pass since in diff we handle it
	// zero UTC
	const res14 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res14_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(1)[]`,
	);
	// precision is bigger than in default
	// cockroach will not pad this
	// this should pass since in diff we handle it
	// +00
	const res15 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res15_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp(5)[]`,
	);
	// precision is bigger than in default
	// cockroach will not pad this
	// this should pass since in diff we handle it
	// custom timezone
	const res16 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res16_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(5)[]`,
	);

	// precision is less than in default
	// cockroach will not trim this
	// without UTC
	const res17 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res17_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(1)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// zero UTC
	const res18 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res18_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(1)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// +00
	const res19 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res19_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp(1)[]`,
	);
	// precision is less than in default
	// cockroach will store this value trimmed
	// this should pass since in diff we handle it
	// custom timezone
	const res20 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res20_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(1)[]`,
	);

	// precision same
	// without UTC
	const res21 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23T12:53:53.115'),
		`'2025-05-23T12:53:53.115'`,
	);
	const res21_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default(['2025-05-23T12:53:53.115']),
		`'{"2025-05-23T12:53:53.115"}'::timestamp(3)[]`,
	);
	// precision same
	// zero UTC
	const res22 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res22_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default(['2025-05-23T12:53:53.115Z']),
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp(3)[]`,
	);
	// precision same
	// +00
	const res23 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23T12:53:53.115+00'),
		`'2025-05-23T12:53:53.115+00'`,
	);
	const res23_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+00']),
		`'{"2025-05-23T12:53:53.115+00"}'::timestamp(3)[]`,
	);
	// precision same
	// custom timezone
	const res24 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).default('2025-05-23T12:53:53.115+04:30'),
		`'2025-05-23T12:53:53.115+04:30'`,
	);
	const res24_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).array().default(['2025-05-23T12:53:53.115+04:30']),
		`'{"2025-05-23T12:53:53.115+04:30"}'::timestamp(1)[]`,
	);

	const res25 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 1, withTimezone: true }).defaultNow(),
		`now()`,
	);

	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res6_1).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res7_1).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res8_1).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res9_1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res10_1).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res11_1).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res12_1).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res13_1).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res14_1).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res15_1).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res16_1).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res17_1).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res18_1).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res19_1).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res20_1).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
	expect.soft(res21_1).toStrictEqual([]);
	expect.soft(res22).toStrictEqual([]);
	expect.soft(res22_1).toStrictEqual([]);
	expect.soft(res23).toStrictEqual([]);
	expect.soft(res23_1).toStrictEqual([]);
	expect.soft(res24).toStrictEqual([]);
	expect.soft(res24_1).toStrictEqual([]);
	expect.soft(res25).toStrictEqual([]);
});

test('time + time arrays', async () => {
	// normal time without precision
	const res1 = await diffDefault(_, time().default('15:50:33'), `'15:50:33'`);
	const res1_1 = await diffDefault(_, time().default('15:50:33Z'), `'15:50:33Z'`);
	const res1_2 = await diffDefault(_, time().default('15:50:33+00'), `'15:50:33+00'`);
	const res1_3 = await diffDefault(_, time().default('15:50:33+03'), `'15:50:33+03'`);
	const res1_4 = await diffDefault(_, time().default('2025-05-23 15:50:33'), `'2025-05-23 15:50:33'`);
	const res1_5 = await diffDefault(_, time().default('2025-05-23 15:50:33Z'), `'2025-05-23 15:50:33Z'`);
	const res1_6 = await diffDefault(_, time().default('2025-05-23T15:50:33+00'), `'2025-05-23T15:50:33+00'`);
	const res1_7 = await diffDefault(_, time().default('2025-05-23 15:50:33+03'), `'2025-05-23 15:50:33+03'`);

	const res1_8 = await diffDefault(_, time({ withTimezone: true }).default('15:50:33'), `'15:50:33'`);
	const res1_9 = await diffDefault(_, time({ withTimezone: true }).default('15:50:33Z'), `'15:50:33Z'`);
	const res1_10 = await diffDefault(_, time({ withTimezone: true }).default('15:50:33+00'), `'15:50:33+00'`);
	const res1_11 = await diffDefault(_, time({ withTimezone: true }).default('15:50:33+03'), `'15:50:33+03'`);
	const res1_12 = await diffDefault(
		_,
		time({ withTimezone: true }).default('2025-05-23 15:50:33'),
		`'2025-05-23 15:50:33'`,
	);
	const res1_13 = await diffDefault(
		_,
		time({ withTimezone: true }).default('2025-05-23 15:50:33Z'),
		`'2025-05-23 15:50:33Z'`,
	);
	const res1_14 = await diffDefault(
		_,
		time({ withTimezone: true }).default('2025-05-23T15:50:33+00'),
		`'2025-05-23T15:50:33+00'`,
	);
	const res1_15 = await diffDefault(
		_,
		time({ withTimezone: true }).default('2025-05-23 15:50:33+03'),
		`'2025-05-23 15:50:33+03'`,
	);

	// normal time with precision that is same as in default
	const res2 = await diffDefault(_, time({ precision: 3 }).default('15:50:33.123'), `'15:50:33.123'`);
	const res2_1 = await diffDefault(_, time({ precision: 3 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	const res2_2 = await diffDefault(_, time({ precision: 3 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	const res2_3 = await diffDefault(_, time({ precision: 3 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	const res2_4 = await diffDefault(
		_,
		time({ precision: 3 }).default('2025-05-23 15:50:33.123'),
		`'2025-05-23 15:50:33.123'`,
	);
	const res2_5 = await diffDefault(
		_,
		time({ precision: 3 }).default('2025-05-23 15:50:33.123Z'),
		`'2025-05-23 15:50:33.123Z'`,
	);
	const res2_6 = await diffDefault(
		_,
		time({ precision: 3 }).default('2025-05-23T15:50:33.123+00'),
		`'2025-05-23T15:50:33.123+00'`,
	);
	const res2_7 = await diffDefault(
		_,
		time({ precision: 3 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res2_8 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	const res2_9 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123Z'),
		`'15:50:33.123Z'`,
	);
	const res2_10 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123+00'),
		`'15:50:33.123+00'`,
	);
	const res2_11 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123+03'),
		`'15:50:33.123+03'`,
	);
	const res2_12 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123'),
		`'2025-05-23 15:50:33.123'`,
	);
	const res2_13 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
		`'2025-05-23 15:50:33.123Z'`,
	);
	const res2_14 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
		`'2025-05-23T15:50:33.123+00'`,
	);
	const res2_15 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal time with precision that is less than in default
	const res3 = await diffDefault(_, time({ precision: 1 }).default('15:50:33.123'), `'15:50:33.123'`);
	const res3_1 = await diffDefault(_, time({ precision: 1 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	const res3_2 = await diffDefault(_, time({ precision: 1 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	const res3_3 = await diffDefault(_, time({ precision: 1 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	const res3_4 = await diffDefault(
		_,
		time({ precision: 1 }).default('2025-05-23 15:50:33.123'),
		`'2025-05-23 15:50:33.123'`,
	);
	const res3_5 = await diffDefault(
		_,
		time({ precision: 1 }).default('2025-05-23 15:50:33.123Z'),
		`'2025-05-23 15:50:33.123Z'`,
	);
	const res3_6 = await diffDefault(
		_,
		time({ precision: 1 }).default('2025-05-23T15:50:33.123+00'),
		`'2025-05-23T15:50:33.123+00'`,
	);
	const res3_7 = await diffDefault(
		_,
		time({ precision: 1 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res3_8 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	const res3_9 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('15:50:33.123Z'),
		`'15:50:33.123Z'`,
	);
	const res3_10 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('15:50:33.123+00'),
		`'15:50:33.123+00'`,
	);
	const res3_11 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('15:50:33.123+03'),
		`'15:50:33.123+03'`,
	);
	const res3_12 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123'),
		`'2025-05-23 15:50:33.123'`,
	);
	const res3_13 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
		`'2025-05-23 15:50:33.123Z'`,
	);
	const res3_14 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
		`'2025-05-23T15:50:33.123+00'`,
	);
	const res3_15 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal time with precision that is bigger than in default
	const res4 = await diffDefault(_, time({ precision: 5 }).default('15:50:33.123'), `'15:50:33.123'`);
	const res4_1 = await diffDefault(_, time({ precision: 5 }).default('15:50:33.123Z'), `'15:50:33.123Z'`);
	const res4_2 = await diffDefault(_, time({ precision: 5 }).default('15:50:33.123+00'), `'15:50:33.123+00'`);
	const res4_3 = await diffDefault(_, time({ precision: 5 }).default('15:50:33.123+03'), `'15:50:33.123+03'`);
	const res4_4 = await diffDefault(
		_,
		time({ precision: 5 }).default('2025-05-23 15:50:33.123'),
		`'2025-05-23 15:50:33.123'`,
	);
	const res4_5 = await diffDefault(
		_,
		time({ precision: 5 }).default('2025-05-23 15:50:33.123Z'),
		`'2025-05-23 15:50:33.123Z'`,
	);
	const res4_6 = await diffDefault(
		_,
		time({ precision: 5 }).default('2025-05-23T15:50:33.123+00'),
		`'2025-05-23T15:50:33.123+00'`,
	);
	const res4_7 = await diffDefault(
		_,
		time({ precision: 5 }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	const res4_8 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	const res4_9 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('15:50:33.123Z'),
		`'15:50:33.123Z'`,
	);
	const res4_10 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('15:50:33.123+00'),
		`'15:50:33.123+00'`,
	);
	const res4_11 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('15:50:33.123+03'),
		`'15:50:33.123+03'`,
	);
	const res4_12 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123'),
		`'2025-05-23 15:50:33.123'`,
	);
	const res4_13 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123Z'),
		`'2025-05-23 15:50:33.123Z'`,
	);
	const res4_14 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('2025-05-23T15:50:33.123+00'),
		`'2025-05-23T15:50:33.123+00'`,
	);
	const res4_15 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).default('2025-05-23 15:50:33.123+03'),
		`'2025-05-23 15:50:33.123+03'`,
	);

	// normal array time without precision
	const res5 = await diffDefault(_, time().array().default(['15:50:33']), `'{15:50:33}'::time[]`);
	const res5_1 = await diffDefault(_, time().array().default(['15:50:33Z']), `'{15:50:33Z}'::time[]`);
	const res5_2 = await diffDefault(_, time().array().default(['15:50:33+00']), `'{15:50:33+00}'::time[]`);
	const res5_3 = await diffDefault(_, time().array().default(['15:50:33+03']), `'{15:50:33+03}'::time[]`);
	const res5_4 = await diffDefault(
		_,
		time().array().default(['2025-05-23 15:50:33']),
		`'{2025-05-23 15:50:33}'::time[]`,
	);
	const res5_5 = await diffDefault(
		_,
		time().array().default(['2025-05-23 15:50:33Z']),
		`'{2025-05-23 15:50:33Z}'::time[]`,
	);
	const res5_6 = await diffDefault(
		_,
		time().array().default(['2025-05-23T15:50:33+00']),
		`'{2025-05-23T15:50:33+00}'::time[]`,
	);
	const res5_7 = await diffDefault(
		_,
		time().array().default(['2025-05-23 15:50:33+03']),
		`'{2025-05-23 15:50:33+03}'::time[]`,
	);

	const res5_8 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['15:50:33']),
		`'{15:50:33}'::timetz[]`,
	);
	const res5_9 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['15:50:33Z']),
		`'{15:50:33Z}'::timetz[]`,
	);
	const res5_10 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['15:50:33+00']),
		`'{15:50:33+00}'::timetz[]`,
	);
	const res5_11 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['15:50:33+03']),
		`'{15:50:33+03}'::timetz[]`,
	);
	const res5_12 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['2025-05-23 15:50:33']),
		`'{2025-05-23 15:50:33}'::timetz[]`,
	);
	const res5_13 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['2025-05-23 15:50:33Z']),
		`'{2025-05-23 15:50:33Z}'::timetz[]`,
	);
	const res5_14 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['2025-05-23T15:50:33+00']),
		`'{2025-05-23T15:50:33+00}'::timetz[]`,
	);
	const res5_15 = await diffDefault(
		_,
		time({ withTimezone: true }).array().default(['2025-05-23 15:50:33+03']),
		`'{2025-05-23 15:50:33+03}'::timetz[]`,
	);

	// normal array time with precision that is same as in default
	const res6 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(3)[]`,
	);
	const res6_1 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['15:50:33.123Z']),
		`'{15:50:33.123Z}'::time(3)[]`,
	);
	const res6_2 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['15:50:33.123+00']),
		`'{15:50:33.123+00}'::time(3)[]`,
	);
	const res6_3 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['15:50:33.123+03']),
		`'{15:50:33.123+03}'::time(3)[]`,
	);
	const res6_4 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123']),
		`'{2025-05-23 15:50:33.123}'::time(3)[]`,
	);
	const res6_5 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123Z']),
		`'{2025-05-23 15:50:33.123Z}'::time(3)[]`,
	);
	const res6_6 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['2025-05-23T15:50:33.123+00']),
		`'{2025-05-23T15:50:33.123+00}'::time(3)[]`,
	);
	const res6_7 = await diffDefault(
		_,
		time({ precision: 3 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(3)[]`,
	);

	const res6_8 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(3)[]`,
	);
	const res6_9 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123Z']),
		`'{15:50:33.123Z}'::timetz(3)[]`,
	);
	const res6_10 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123+00']),
		`'{15:50:33.123+00}'::timetz(3)[]`,
	);
	const res6_11 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123+03']),
		`'{15:50:33.123+03}'::timetz(3)[]`,
	);
	const res6_12 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
		`'{2025-05-23 15:50:33.123}'::timetz(3)[]`,
	);
	const res6_13 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
		`'{2025-05-23 15:50:33.123Z}'::timetz(3)[]`,
	);
	const res6_14 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
		`'{2025-05-23T15:50:33.123+00}'::timetz(3)[]`,
	);
	const res6_15 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(3)[]`,
	);

	// normal array time with precision that is less than in default
	const res7 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(1)[]`,
	);
	const res7_1 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['15:50:33.123Z']),
		`'{15:50:33.123Z}'::time(1)[]`,
	);
	const res7_2 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['15:50:33.123+00']),
		`'{15:50:33.123+00}'::time(1)[]`,
	);
	const res7_3 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['15:50:33.123+03']),
		`'{15:50:33.123+03}'::time(1)[]`,
	);
	const res7_4 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123']),
		`'{2025-05-23 15:50:33.123}'::time(1)[]`,
	);
	const res7_5 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123Z']),
		`'{2025-05-23 15:50:33.123Z}'::time(1)[]`,
	);
	const res7_6 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['2025-05-23T15:50:33.123+00']),
		`'{2025-05-23T15:50:33.123+00}'::time(1)[]`,
	);
	const res7_7 = await diffDefault(
		_,
		time({ precision: 1 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(1)[]`,
	);

	const res7_8 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(1)[]`,
	);
	const res7_9 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123Z']),
		`'{15:50:33.123Z}'::timetz(1)[]`,
	);
	const res7_10 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123+00']),
		`'{15:50:33.123+00}'::timetz(1)[]`,
	);
	const res7_11 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['15:50:33.123+03']),
		`'{15:50:33.123+03}'::timetz(1)[]`,
	);
	const res7_12 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
		`'{2025-05-23 15:50:33.123}'::timetz(1)[]`,
	);
	const res7_13 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
		`'{2025-05-23 15:50:33.123Z}'::timetz(1)[]`,
	);
	const res7_14 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
		`'{2025-05-23T15:50:33.123+00}'::timetz(1)[]`,
	);
	const res7_15 = await diffDefault(
		_,
		time({ precision: 1, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(1)[]`,
	);

	// normal array time with precision that is bigger than in default
	const res8 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(5)[]`,
	);
	const res8_1 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['15:50:33.123Z']),
		`'{15:50:33.123Z}'::time(5)[]`,
	);
	const res8_2 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['15:50:33.123+00']),
		`'{15:50:33.123+00}'::time(5)[]`,
	);
	const res8_3 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['15:50:33.123+03']),
		`'{15:50:33.123+03}'::time(5)[]`,
	);
	const res8_4 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123']),
		`'{2025-05-23 15:50:33.123}'::time(5)[]`,
	);
	const res8_5 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123Z']),
		`'{2025-05-23 15:50:33.123Z}'::time(5)[]`,
	);
	const res8_6 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['2025-05-23T15:50:33.123+00']),
		`'{2025-05-23T15:50:33.123+00}'::time(5)[]`,
	);
	const res8_7 = await diffDefault(
		_,
		time({ precision: 5 }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::time(5)[]`,
	);

	const res8_8 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::timetz(5)[]`,
	);
	const res8_9 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123Z']),
		`'{15:50:33.123Z}'::timetz(5)[]`,
	);
	const res8_10 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123+00']),
		`'{15:50:33.123+00}'::timetz(5)[]`,
	);
	const res8_11 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['15:50:33.123+03']),
		`'{15:50:33.123+03}'::timetz(5)[]`,
	);
	const res8_12 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123']),
		`'{2025-05-23 15:50:33.123}'::timetz(5)[]`,
	);
	const res8_13 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123Z']),
		`'{2025-05-23 15:50:33.123Z}'::timetz(5)[]`,
	);
	const res8_14 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['2025-05-23T15:50:33.123+00']),
		`'{2025-05-23T15:50:33.123+00}'::timetz(5)[]`,
	);
	const res8_15 = await diffDefault(
		_,
		time({ precision: 5, withTimezone: true }).array().default(['2025-05-23 15:50:33.123+03']),
		`'{2025-05-23 15:50:33.123+03}'::timetz(5)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res1_2).toStrictEqual([]);
	expect.soft(res1_3).toStrictEqual([]);
	expect.soft(res1_4).toStrictEqual([]);
	expect.soft(res1_5).toStrictEqual([]);
	expect.soft(res1_6).toStrictEqual([]);
	expect.soft(res1_7).toStrictEqual([]);
	expect.soft(res1_8).toStrictEqual([]);
	expect.soft(res1_9).toStrictEqual([]);
	expect.soft(res1_10).toStrictEqual([]);
	expect.soft(res1_11).toStrictEqual([]);
	expect.soft(res1_12).toStrictEqual([]);
	expect.soft(res1_13).toStrictEqual([]);
	expect.soft(res1_14).toStrictEqual([]);
	expect.soft(res1_15).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res2_2).toStrictEqual([]);
	expect.soft(res2_3).toStrictEqual([]);
	expect.soft(res2_4).toStrictEqual([]);
	expect.soft(res2_5).toStrictEqual([]);
	expect.soft(res2_6).toStrictEqual([]);
	expect.soft(res2_7).toStrictEqual([]);
	expect.soft(res2_8).toStrictEqual([]);
	expect.soft(res2_9).toStrictEqual([]);
	expect.soft(res2_10).toStrictEqual([]);
	expect.soft(res2_11).toStrictEqual([]);
	expect.soft(res2_12).toStrictEqual([]);
	expect.soft(res2_13).toStrictEqual([]);
	expect.soft(res2_14).toStrictEqual([]);
	expect.soft(res2_15).toStrictEqual([]);

	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res3_2).toStrictEqual([]);
	expect.soft(res3_3).toStrictEqual([]);
	expect.soft(res3_4).toStrictEqual([]);
	expect.soft(res3_5).toStrictEqual([]);
	expect.soft(res3_6).toStrictEqual([]);
	expect.soft(res3_7).toStrictEqual([]);
	expect.soft(res3_8).toStrictEqual([]);
	expect.soft(res3_9).toStrictEqual([]);
	expect.soft(res3_10).toStrictEqual([]);
	expect.soft(res3_11).toStrictEqual([]);
	expect.soft(res3_12).toStrictEqual([]);
	expect.soft(res3_13).toStrictEqual([]);
	expect.soft(res3_14).toStrictEqual([]);
	expect.soft(res3_15).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res4_1).toStrictEqual([]);
	expect.soft(res4_2).toStrictEqual([]);
	expect.soft(res4_3).toStrictEqual([]);
	expect.soft(res4_4).toStrictEqual([]);
	expect.soft(res4_5).toStrictEqual([]);
	expect.soft(res4_6).toStrictEqual([]);
	expect.soft(res4_7).toStrictEqual([]);
	expect.soft(res4_8).toStrictEqual([]);
	expect.soft(res4_9).toStrictEqual([]);
	expect.soft(res4_10).toStrictEqual([]);
	expect.soft(res4_11).toStrictEqual([]);
	expect.soft(res4_12).toStrictEqual([]);
	expect.soft(res4_13).toStrictEqual([]);
	expect.soft(res4_14).toStrictEqual([]);
	expect.soft(res4_15).toStrictEqual([]);

	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
	expect.soft(res5_2).toStrictEqual([]);
	expect.soft(res5_3).toStrictEqual([]);
	expect.soft(res5_4).toStrictEqual([]);
	expect.soft(res5_5).toStrictEqual([]);
	expect.soft(res5_6).toStrictEqual([]);
	expect.soft(res5_7).toStrictEqual([]);
	expect.soft(res5_8).toStrictEqual([]);
	expect.soft(res5_9).toStrictEqual([]);
	expect.soft(res5_10).toStrictEqual([]);
	expect.soft(res5_11).toStrictEqual([]);
	expect.soft(res5_12).toStrictEqual([]);
	expect.soft(res5_13).toStrictEqual([]);
	expect.soft(res5_14).toStrictEqual([]);
	expect.soft(res5_15).toStrictEqual([]);

	expect.soft(res6).toStrictEqual([]);
	expect.soft(res6_1).toStrictEqual([]);
	expect.soft(res6_2).toStrictEqual([]);
	expect.soft(res6_3).toStrictEqual([]);
	expect.soft(res6_4).toStrictEqual([]);
	expect.soft(res6_5).toStrictEqual([]);
	expect.soft(res6_6).toStrictEqual([]);
	expect.soft(res6_7).toStrictEqual([]);
	expect.soft(res6_8).toStrictEqual([]);
	expect.soft(res6_9).toStrictEqual([]);
	expect.soft(res6_10).toStrictEqual([]);
	expect.soft(res6_11).toStrictEqual([]);
	expect.soft(res6_12).toStrictEqual([]);
	expect.soft(res6_13).toStrictEqual([]);
	expect.soft(res6_14).toStrictEqual([]);
	expect.soft(res6_15).toStrictEqual([]);

	expect.soft(res7).toStrictEqual([]);
	expect.soft(res7_1).toStrictEqual([]);
	expect.soft(res7_2).toStrictEqual([]);
	expect.soft(res7_3).toStrictEqual([]);
	expect.soft(res7_4).toStrictEqual([]);
	expect.soft(res7_5).toStrictEqual([]);
	expect.soft(res7_6).toStrictEqual([]);
	expect.soft(res7_7).toStrictEqual([]);
	expect.soft(res7_8).toStrictEqual([]);
	expect.soft(res7_9).toStrictEqual([]);
	expect.soft(res7_10).toStrictEqual([]);
	expect.soft(res7_11).toStrictEqual([]);
	expect.soft(res7_12).toStrictEqual([]);
	expect.soft(res7_13).toStrictEqual([]);
	expect.soft(res7_14).toStrictEqual([]);
	expect.soft(res7_15).toStrictEqual([]);

	expect.soft(res8).toStrictEqual([]);
	expect.soft(res8_1).toStrictEqual([]);
	expect.soft(res8_2).toStrictEqual([]);
	expect.soft(res8_3).toStrictEqual([]);
	expect.soft(res8_4).toStrictEqual([]);
	expect.soft(res8_5).toStrictEqual([]);
	expect.soft(res8_6).toStrictEqual([]);
	expect.soft(res8_7).toStrictEqual([]);
	expect.soft(res8_8).toStrictEqual([]);
	expect.soft(res8_9).toStrictEqual([]);
	expect.soft(res8_10).toStrictEqual([]);
	expect.soft(res8_11).toStrictEqual([]);
	expect.soft(res8_12).toStrictEqual([]);
	expect.soft(res8_13).toStrictEqual([]);
	expect.soft(res8_14).toStrictEqual([]);
	expect.soft(res8_15).toStrictEqual([]);
});

test('date + date arrays', async () => {
	// dates
	const res1 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res1_1 = await diffDefault(
		_,
		date({ mode: 'date' }).default(new Date('2025-05-23T12:12:31.213')),
		`'2025-05-23'`,
	);
	const res1_2 = await diffDefault(_, date({ mode: 'date' }).defaultNow(), `now()`);

	const res2 = await diffDefault(_, date({ mode: 'date' }).array().default([]), `'{}'::date[]`);
	const res2_1 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res2_2 = await diffDefault(
		_,
		date({ mode: 'date' }).default(new Date('2025-05-23T12:12:31.213')),
		`'2025-05-23'`,
	);
	const res2_3 = await diffDefault(_, date({ mode: 'date' }).defaultNow(), `now()`);

	// strings
	const res3 = await diffDefault(_, date({ mode: 'string' }).default('2025-05-23'), `'2025-05-23'`);
	const res3_1 = await diffDefault(
		_,
		date({ mode: 'string' }).default('2025-05-23T12:12:31.213'),
		`'2025-05-23T12:12:31.213'`,
	);
	const res3_2 = await diffDefault(_, date({ mode: 'string' }).defaultNow(), `now()`);
	const res3_3 = await diffDefault(
		_,
		date({ mode: 'string' }).default('2025-05-23 12:12:31.213+01:00'),
		`'2025-05-23 12:12:31.213+01:00'`,
	);

	const res4 = await diffDefault(_, date({ mode: 'string' }).array().default(['2025-05-23']), `'{2025-05-23}'::date[]`);
	const res4_1 = await diffDefault(
		_,
		date({ mode: 'string' }).array().default(['2025-05-23T12:12:31.213']),
		`'{2025-05-23T12:12:31.213}'::date[]`,
	);
	const res4_2 = await diffDefault(
		_,
		date({ mode: 'string' }).array().default(['2025-05-23 12:12:31.213+01:00']),
		`'{2025-05-23 12:12:31.213+01:00}'::date[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res1_2).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res2_2).toStrictEqual([]);
	expect.soft(res2_3).toStrictEqual([]);

	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res3_2).toStrictEqual([]);
	expect.soft(res3_3).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res4_1).toStrictEqual([]);
	expect.soft(res4_2).toStrictEqual([]);
});

test.todo('interval + interval arrays', async () => {
	const res1 = await diffDefault(_, interval().default('1 day'), `'1 day'`);
	const res10 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).default('1 day 3 second'),
		`'1 day 3 second'`,
	);

	const res2 = await diffDefault(_, interval().array().default([]), `'{}'::interval[]`);
	const res20 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().default([]),
		`'{}'::interval day to second(3)[]`,
	);

	const res3 = await diffDefault(_, interval().array().default(['1 day']), `'{"1 day"}'::interval[]`);
	const res30 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().default(['1 day 3 second']),
		`'{"1 day 3 second"}'::interval day to second(3)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res10.length).toBe(1);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res30.length).toBe(1);
});

test.todo('enum + enum arrays', async () => {
	const moodEnum = cockroachEnum('mood_enum', [
		'sad',
		'ok',
		'happy',
		`text'text"`,
		`no,''"\`rm`,
		`mo''",\\\`}{od`,
		`mo''",\\\\\\\`}{od`,
		'mo,\`od',
	]);
	const pre = { moodEnum };

	const res1 = await diffDefault(_, moodEnum().default('ok'), `'ok'::"mood_enum"`, false, pre);

	const res4 = await diffDefault(_, moodEnum().array().default([]), `'{}'::"mood_enum"[]`, false, pre);
	const res5 = await diffDefault(_, moodEnum().array().default(['ok']), `'{ok}'::"mood_enum"[]`, false, pre);

	expect.soft(res1).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('uuid + uuid arrays', async () => {
	const res1 = await diffDefault(
		_,
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		`'550e8400-e29b-41d4-a716-446655440000'`,
	);

	const res2 = await diffDefault(_, uuid().array().default([]), `'{}'::uuid[]`);

	const res4 = await diffDefault(
		_,
		uuid().array().default(['550e8400-e29b-41d4-a716-446655440000']),
		`'{550e8400-e29b-41d4-a716-446655440000}'::uuid[]`,
	);

	const res5 = await diffDefault(_, uuid().defaultRandom(), `gen_random_uuid()`);

	const res6 = await diffDefault(
		_,
		uuid()
			.array()
			.default(sql`'{550e8400-e29b-41d4-a716-446655440001}'`),
		`'{550e8400-e29b-41d4-a716-446655440001}'::uuid[]`,
	);

	const res7 = await diffDefault(
		_,
		uuid()
			.array()
			.default(sql`'{550e8400-e29b-41d4-a716-446655440002}'::uuid[]`),
		`'{550e8400-e29b-41d4-a716-446655440002}'::uuid[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test.todo('corner cases', async () => {
	const moodEnum = cockroachEnum('mood_enum', [
		'sad',
		'ok',
		'happy',
		`text'text"`,
		`no,''"\`rm`,
		`mo''",\`}{od`,
		'mo,\`od',
	]);
	const pre = { moodEnum };

	const res6 = await diffDefault(
		_,
		moodEnum().array().default([`text'text"`]),
		`'{"text''text\\\""}'::"mood_enum"[]`,
		pre,
	);
	const res60 = await diffDefault(
		_,
		moodEnum().array().default([`text'text"`, 'ok']),
		`'{"text''text\\\"",ok}'::"mood_enum"[]`,
		pre,
	);

	const res7 = await diffDefault(
		_,
		moodEnum().array().default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`\}\{od"}'::"mood_enum"[]`,
		pre,
	);

	expect.soft(res6).toStrictEqual([]);
	expect.soft(res60).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);

	const res2 = await diffDefault(_, uuid().defaultRandom(), `gen_random_uuid()`);
	expect.soft(res2).toStrictEqual([]);

	const res3 = await diffDefault(_, uuid().array().default([]), `'{}'::uuid[]`);
	expect.soft(res3).toStrictEqual([]);

	const res_3 = await diffDefault(_, moodEnum().default(`mo''",\`}{od`), `'mo''''",\`}{od'::"mood_enum"`, pre);
	expect.soft(res_3).toStrictEqual([]);

	const res_2 = await diffDefault(_, moodEnum().default(`text'text"`), `'text''text"'::"mood_enum"`, pre);
	expect.soft(res_2).toStrictEqual([]);

	const res__14 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.array()
			.default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`\}\{od"}'::string[]`,
	);
	expect.soft(res__14).toStrictEqual([]);
});

test('bit + bit arrays', async () => {
	const res1 = await diffDefault(_, bit().default(`101`), `'101'`);
	const res2 = await diffDefault(_, bit().default(`1010010010`), `'1010010010'`);

	const res3 = await diffDefault(_, bit({ length: 4 }).default(`101`), `'101'`);
	const res4 = await diffDefault(_, bit({ length: 4 }).default(`1010010010`), `'1010010010'`);

	const res5 = await diffDefault(_, bit().array().default([]), `'{}'::bit[]`);
	const res6 = await diffDefault(_, bit().array().default([`101`]), `'{101}'::bit[]`);

	const res7 = await diffDefault(_, bit({ length: 3 }).array().default([]), `'{}'::bit(3)[]`);
	const res8 = await diffDefault(_, bit({ length: 3 }).array().default([`10110`]), `'{10110}'::bit(3)[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
});

test('varbit + varbit arrays', async () => {
	const res1 = await diffDefault(_, varbit().default(`101`), `'101'`);
	const res2 = await diffDefault(_, varbit().default(`1010010010`), `'1010010010'`);

	const res3 = await diffDefault(_, varbit({ length: 4 }).default(`101`), `'101'`);
	const res4 = await diffDefault(_, varbit({ length: 4 }).default(`1010010010`), `'1010010010'`);

	const res5 = await diffDefault(_, varbit().array().default([]), `'{}'::varbit[]`);
	const res6 = await diffDefault(_, varbit().array().default([`101`]), `'{101}'::varbit[]`);

	const res7 = await diffDefault(_, varbit({ length: 3 }).array().default([]), `'{}'::varbit(3)[]`);
	const res8 = await diffDefault(_, varbit({ length: 3 }).array().default([`10110`]), `'{10110}'::varbit(3)[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
});

test.todo('vector + vector arrays', async () => {
	const res1 = await diffDefault(_, vector({ dimensions: 3 }).default([0, -2, 3]), `'[0,-2,3]'`);
	const res2 = await diffDefault(
		_,
		vector({ dimensions: 3 }).default([0, -2.123456789, 3.123456789]),
		`'[0,-2.1234567,3.1234567]'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

// postgis extension
// SRID=4326 -> these coordinates are longitude/latitude values
test.todo('geometry + geometry arrays', async () => {
	const res1 = await diffDefault(
		_,
		geometry({ srid: 100, mode: 'tuple', type: 'point' }).default([30.5234, 50.4501]),
		`'SRID=4326;POINT(30.7233 46.4825)'`,
	);

	const res2 = await diffDefault(
		_,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }),
		`'SRID=4326;POINT(30.7233 46.4825)'`,
	);

	const res3 = await diffDefault(
		_,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([]),
		`'{}'::geometry(point, 4326)[]`,
	);
	const res4 = await diffDefault(
		_,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' })
			.array()
			.default([[30.5234, 50.4501]]),
		`'{"SRID=4326;POINT(30.7233 46.4825)"}'::geometry(point, 4326)[]`,
	);

	// const res5 = await diffDefault(
	// 	_,
	// 	geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([]),
	// 	`'{}'::geometry(point, 4326)[]`,
	// );
	// const res6 = await diffDefault(
	// 	_,
	// 	geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([{ x: 30.5234, y: 50.4501 }]),
	// 	`'{"SRID=4326;POINT(30.7233 46.4825)"}'::geometry(point, 4326)[]`,
	// );

	expect.soft(res1).toStrictEqual([]);
	// expect.soft(res2).toStrictEqual([]);
	// expect.soft(res3).toStrictEqual([]);
	// expect.soft(res4).toStrictEqual([]);
	// expect.soft(res5).toStrictEqual([]);
	// expect.soft(res6).toStrictEqual([]);
});
