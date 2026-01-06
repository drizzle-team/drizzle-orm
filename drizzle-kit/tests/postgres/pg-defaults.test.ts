import { sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	bit,
	boolean,
	char,
	cidr,
	date,
	doublePrecision,
	geometry,
	halfvec,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	point,
	real,
	serial,
	smallint,
	smallserial,
	sparsevec,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/pg-core';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffDefault, preparePostgisTestDatabase, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;

beforeAll(async () => {
	_ = await prepareTestDatabase();
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('integer', async () => {
	const res1 = await diffDefault(_, integer().default(10), '10');
	const res2 = await diffDefault(_, integer().default(0), '0');
	const res3 = await diffDefault(_, integer().default(-10), '-10');
	const res4 = await diffDefault(_, integer().default(1e4), '10000');
	const res5 = await diffDefault(_, integer().default(-1e4), '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('integer arrays', async () => {
	const res1 = await diffDefault(_, integer().array().default([]), "'{}'::integer[]");
	const res2 = await diffDefault(_, integer().array().default([10]), "'{10}'::integer[]");
	const res3 = await diffDefault(_, integer().array('[][]').default([]), "'{}'::integer[]");
	const res4 = await diffDefault(_, integer().array('[][]').default([[]]), "'{}'::integer[]");
	const res5 = await diffDefault(_, integer().array('[][]').default([[1, 2]]), "'{{1,2}}'::integer[]");
	const res6 = await diffDefault(_, integer().array('[][]').default([[1, 2], [1, 2]]), "'{{1,2},{1,2}}'::integer[]");
	const res7 = await diffDefault(
		_,
		integer().array('[][][]').default([[[1, 2]], [[1, 2]]]),
		"'{{{1,2}},{{1,2}}}'::integer[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
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
	const res1 = await diffDefault(_, smallint().array().default([]), "'{}'::smallint[]");
	const res2 = await diffDefault(_, smallint().array().default([32767]), "'{32767}'::smallint[]");
	const res3 = await diffDefault(_, smallint().array('[][]').default([]), "'{}'::smallint[]");
	const res4 = await diffDefault(_, smallint().array('[][]').default([[]]), "'{}'::smallint[]");
	const res5 = await diffDefault(_, smallint().array('[][]').default([[1, 2]]), "'{{1,2}}'::smallint[]");
	const res6 = await diffDefault(
		_,
		smallint().array('[][]').default([[1, 2], [1, 2]]),
		"'{{1,2},{1,2}}'::smallint[]",
	);
	const res7 = await diffDefault(
		_,
		smallint().array('[][][]').default([[[1, 2]], [[1, 2]]]),
		"'{{{1,2}},{{1,2}}}'::smallint[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('bigint', async () => {
	// 2^53
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res2 = await diffDefault(_, bigint({ mode: 'number' }).default(-9007199254740991), '-9007199254740991');
	// 2^63 - 1
	const res3 = await diffDefault(_, bigint({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807');
	// -2^63
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).default(-9223372036854775808n),
		'-9223372036854775808',
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('bigint arrays', async () => {
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).array().default([]), "'{}'::bigint[]");
	const res2 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default([]), "'{}'::bigint[]");

	const res3 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array().default([9007199254740991]),
		"'{9007199254740991}'::bigint[]",
	);
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().default([9223372036854775807n]),
		"'{9223372036854775807}'::bigint[]",
	);

	const res5 = await diffDefault(_, bigint({ mode: 'number' }).array('[][]').default([]), "'{}'::bigint[]");
	const res6 = await diffDefault(_, bigint({ mode: 'bigint' }).array('[][]').default([]), "'{}'::bigint[]");

	const res7 = await diffDefault(_, bigint({ mode: 'number' }).array('[][]').default([[]]), "'{}'::bigint[]");
	const res8 = await diffDefault(_, bigint({ mode: 'bigint' }).array('[][]').default([[]]), "'{}'::bigint[]");

	const res9 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array('[][]').default([[1, 2], [1, 2]]),
		"'{{1,2},{1,2}}'::bigint[]",
	);
	const res10 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array('[][]').default([[1n, 2n], [1n, 2n]]),
		"'{{1,2},{1,2}}'::bigint[]",
	);

	const res11 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array('[][][]').default([[[1, 2]], [[1, 2]]]),
		"'{{{1,2}},{{1,2}}}'::bigint[]",
	);
	const res12 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array('[][][]').default([[[1n, 2n]], [[1n, 2n]]]),
		"'{{{1,2}},{{1,2}}}'::bigint[]",
	);

	const res13 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default(sql`'{}'`), "'{}'::bigint[]");
	const res14 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default(sql`'{}'::bigint[]`), "'{}'::bigint[]");
	const res15 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().default(sql`'{9223372036854775807}'::bigint[]`),
		"'{9223372036854775807}'::bigint[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('serials', async () => {
	const res1 = await diffDefault(_, serial(), '');
	const res2 = await diffDefault(_, smallserial(), '');
	const res3 = await diffDefault(_, bigserial({ mode: 'number' }), '');
	const res4 = await diffDefault(_, bigserial({ mode: 'bigint' }), '');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4231#:~:text=remove%20the%20default-,Bonus,-This%20is%20the
test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), "'10.123'");

	const res4 = await diffDefault(_, numeric({ mode: 'string' }).default('10.123'), "'10.123'");
	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), "'9007199254740991'");

	const res5 = await diffDefault(_, numeric({ precision: 6 }).default('10.123'), "'10.123'");
	const res6 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.123'), "'10.123'");

	const res7 = await diffDefault(_, numeric({ mode: 'string', scale: 2 }).default('10.123'), "'10.123'");
	const res8 = await diffDefault(_, numeric({ mode: 'string', precision: 6 }).default('10.123'), "'10.123'");
	const res9 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), "'10.123'");

	const res10 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		"'9223372036854775807'",
	);
	const res11 = await diffDefault(_, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.123), "'10.123'");
	const res12 = await diffDefault(_, numeric({ mode: 'number', scale: 2 }).default(10.123), "'10.123'");
	const res13 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10.123), "'10.123'");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
});

test('numeric arrays', async () => {
	const res1 = await diffDefault(_, numeric({ mode: 'number' }).array().default([]), "'{}'::numeric[]");
	const res2 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::numeric(4,2)[]",
	);
	const res3 = await diffDefault(_, numeric({ mode: 'bigint' }).array().default([]), "'{}'::numeric[]");
	const res4 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::numeric(4)[]",
	);
	const res5 = await diffDefault(_, numeric({ mode: 'string' }).array().default([]), "'{}'::numeric[]");
	const res6 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::numeric(4,2)[]",
	);

	const res7 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::numeric[]", // .1 due to number->string conversion
	);

	const res8 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::numeric(6,2)[]", // .1 due to number->string conversion
	);
	const res9 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::numeric[]",
	);
	const res10 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::numeric(19)[]",
	);
	const res11 = await diffDefault(
		_,
		numeric({ mode: 'string' }).array().default(['10.123', '123.10']),
		"'{10.123,123.10}'::numeric[]",
	);
	const res12 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.10']),
		"'{10.123,123.10}'::numeric(6,2)[]",
	);

	const res13 = await diffDefault(_, numeric({ mode: 'string' }).array('[][]').default([]), "'{}'::numeric[]");
	const res14 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array('[][]').default([]),
		"'{}'::numeric(4,2)[]",
	);
	const res15 = await diffDefault(_, numeric({ mode: 'number' }).array('[][]').default([]), "'{}'::numeric[]");
	const res16 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array('[][]').default([]),
		"'{}'::numeric(4,2)[]",
	);
	const res17 = await diffDefault(_, numeric({ mode: 'bigint' }).array('[][]').default([]), "'{}'::numeric[]");
	const res18 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 4 }).array('[][]').default([]),
		"'{}'::numeric(4)[]",
	);
	const res19 = await diffDefault(
		_,
		numeric({ mode: 'string' }).array('[][]').default([['10.123', '123.10'], ['10.123', '123.10']]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);
	const res20 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array('[][]').default([['10.123', '123.10'], [
			'10.123',
			'123.10',
		]]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric(6,2)[]",
	);

	const res23 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array('[][]').default([[9223372036854775807n, 9223372036854775806n], [
			9223372036854775807n,
			9223372036854775806n,
		]]),
		"'{{9223372036854775807,9223372036854775806},{9223372036854775807,9223372036854775806}}'::numeric[]",
	);
	const res24 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).array('[][]').default([[9223372036854775807n, 9223372036854775806n], [
			9223372036854775807n,
			9223372036854775806n,
		]]),
		"'{{9223372036854775807,9223372036854775806},{9223372036854775807,9223372036854775806}}'::numeric(19)[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
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
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);

	expect.soft(res23).toStrictEqual([]);
	expect.soft(res24).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3582
test('real + real arrays', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');

	const res2 = await diffDefault(_, real().array().default([]), `'{}'::real[]`);
	const res3 = await diffDefault(_, real().array().default([1000.123, 10.2]), `'{1000.123,10.2}'::real[]`);

	const res4 = await diffDefault(_, real().array('[][]').default([]), `'{}'::real[]`);
	const res5 = await diffDefault(
		_,
		real().array('[][]').default([[1000.123, 10.2], [1000.123, 10.2]]),
		`'{{1000.123,10.2},{1000.123,10.2}}'::real[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('doublePrecision + doublePrecision arrays', async () => {
	const res1 = await diffDefault(_, doublePrecision().default(10000.123), '10000.123');

	const res2 = await diffDefault(_, doublePrecision().array().default([]), `'{}'::double precision[]`);
	const res3 = await diffDefault(
		_,
		doublePrecision().array().default([10000.123]),
		`'{10000.123}'::double precision[]`,
	);

	const res4 = await diffDefault(_, doublePrecision().array('[][]').default([]), `'{}'::double precision[]`);
	const res5 = await diffDefault(
		_,
		doublePrecision().array('[][]').default([[10000.123, 10.1], [10000.123, 10.1]]),
		`'{{10000.123,10.1},{10000.123,10.1}}'::double precision[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('boolean + boolean arrays', async () => {
	const res1 = await diffDefault(_, boolean().default(true), 'true');
	const res2 = await diffDefault(_, boolean().default(false), 'false');
	const res3 = await diffDefault(_, boolean().default(sql`true`), 'true');

	const res4 = await diffDefault(_, boolean().array().default([]), `'{}'::boolean[]`);
	const res5 = await diffDefault(_, boolean().array().default([true]), `'{t}'::boolean[]`);

	const res6 = await diffDefault(_, boolean().array('[][]').default([]), `'{}'::boolean[]`);
	const res7 = await diffDefault(_, boolean().array('[][]').default([[true], [false]]), `'{{t},{f}}'::boolean[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('char + char arrays', async () => {
	const res1 = await diffDefault(_, char({ length: 15 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, char({ length: 15 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, char({ length: 15 }).default('text\'text"'), "'text''text\"'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, char({ length: 15 }).default(`mo''",\\\`}{od`), `'mo''''",\\\\\`}{od'`);
	const res5 = await diffDefault(_, char({ length: 15, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`'mo''''\",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, char({ length: 15 }).array().default([]), `'{}'::char(15)[]`);
	const res8 = await diffDefault(_, char({ length: 15 }).array().default(['text']), `'{text}'::char(15)[]`);
	// raw default sql for the line below: '{text''\\text}'::char(15)[];
	const res9 = await diffDefault(
		_,
		char({ length: 15 }).array().default(['\\']),
		`'{"\\\\"}'::char(15)[]`,
	);
	const res10 = await diffDefault(
		_,
		char({ length: 15 }).array().default(["'"]),
		`'{''}'::char(15)[]`,
	);
	const res11 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{one}'::char(15)[]`,
	);
	const res12 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''''\\\",\`\}\{od"}'::char(15)[]`,
	);

	const res13 = await diffDefault(_, char({ length: 15 }).array('[][]').default([]), `'{}'::char(15)[]`);
	// raw default sql for the line below: '{{text\\},{text}}'::text[]
	const res14 = await diffDefault(
		_,
		char({ length: 15 }).array('[][]').default([['text\\'], ['text']]),
		`'{{"text\\\\"},{text}}'::char(15)[]`,
	);
	const res15 = await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array('[][]')
			.default(
				[[`mo''",\`}{od`], [`mo''",\`}{od`]],
			),
		`'{{"mo''''\\\",\`\}\{od"},{"mo''''\\\",\`\}\{od"}}'::char(15)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('varchar + varchar arrays', async () => {
	const res1 = await diffDefault(_, varchar({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 256 }).default('text\'text"'), "'text''text\"'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, varchar({ length: 256 }).default(`mo''",\\\`}{od`), `'mo''''",\\\\\`}{od'`);
	const res5 = await diffDefault(_, varchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`'mo''''",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, varchar({ length: 256 }).array().default([]), `'{}'::varchar(256)[]`);
	const res8 = await diffDefault(_, varchar({ length: 256 }).array().default(['text']), `'{text}'::varchar(256)[]`);
	// raw default sql for the line below: '{text''\\text}'::varchar[];
	const res9 = await diffDefault(
		_,
		varchar({ length: 256 }).array().default(["text'\\text"]),
		`'{"text''\\\\text"}'::varchar(256)[]`,
	);
	const res10 = await diffDefault(
		_,
		varchar({ length: 256 }).array().default(['text\'text"']),
		`'{"text''text\\\""}'::varchar(256)[]`,
	);
	const res11 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{one}'::varchar(256)[]`,
	);
	const res12 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''''\\\",\`\}\{od"}'::varchar(256)[]`,
	);

	const res13 = await diffDefault(_, varchar({ length: 256 }).array('[][]').default([]), `'{}'::varchar(256)[]`);
	// raw default sql for the line below: '{{text\\},{text}}'::varchar[]
	const res14 = await diffDefault(
		_,
		varchar({ length: 256 }).array('[][]').default([['text\\'], ['text']]),
		`'{{"text\\\\"},{text}}'::varchar(256)[]`,
	);
	const res15 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array('[][]')
			.default(
				[[`mo''",\`}{od`], [`mo''",\`}{od`]],
			),
		`'{{"mo''''\\\",\`\}\{od"},{"mo''''\\\",\`\}\{od"}}'::varchar(256)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4231#:~:text=Scenario%202%3A%20text().array().default(%5B%5D)
test('text + text arrays', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, text().default('text\'text"'), "'text''text\"'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res4 = await diffDefault(_, text().default(`mo''",\\\`}{od`), `'mo''''",\\\\\`}{od'`);
	const res5 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	// raw default sql for the line below: 'mo''''",\`}{od';
	const res6 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\\\`}{od`, 'mo,\`od'] }).default(
			`mo''",\\\`}{od`,
		),
		`'mo''''",\\\\\`}{od'`,
	);

	const res7 = await diffDefault(_, text().array().default([]), `'{}'::text[]`);
	const res8 = await diffDefault(_, text().array().default(['text']), `'{text}'::text[]`);
	// raw default sql for the line below: '{text''\\text}'::text[];
	const res9 = await diffDefault(
		_,
		text().array().default(["text'\\text"]),
		`'{"text''\\\\text"}'::text[]`,
	);
	const res10 = await diffDefault(
		_,
		text().array().default([`text'text"`]),
		`'{"text''text\\""}'::text[]`,
	);
	const res11 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{one}'::text[]`,
	);

	const res12 = await diffDefault(_, text().array('[][]').default([]), `'{}'::text[]`);
	// raw default sql for the line below: '{{text\\},{text}}'::text[]
	const res13 = await diffDefault(
		_,
		text().array('[][]').default([['text\\'], ['text']]),
		`'{{"text\\\\"},{text}}'::text[]`,
	);

	const res14 = await diffDefault(_, text().default(sql`gen_random_uuid()`), `gen_random_uuid()`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5119
test('json + json arrays', async () => {
	const res1 = await diffDefault(_, json().default({}), `'{}'`);
	const res2 = await diffDefault(_, json().default([]), `'[]'`);
	const res3 = await diffDefault(_, json().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, json().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, json().default({ key: "val'ue" }), `'{"key":"val''ue"}'`);
	const res6 = await diffDefault(_, json().default({ key: `mo''",\`}{od` }), `'{"key":"mo''''\\\",\`}{od"}'`);
	const res7 = await diffDefault(_, json().default({ key: 'mo",\\`}{od' }), `'{"key":"mo\\\",\\\\\`}{od"}'`);
	const res11 = await diffDefault(_, json().default({ b: 2, a: 1 }), `'{"b":2,"a":1}'`);

	const res8 = await diffDefault(_, json().array().default([]), `'{}'::json[]`);
	const res9 = await diffDefault(
		_,
		json().array().default([{ key: 'value' }]),
		`'{"{\\"key\\":\\"value\\"}"}'::json[]`,
	);
	const res10 = await diffDefault(
		_,
		json().array().default([{ key: "val'ue" }]),
		`'{"{\\"key\\":\\"val''ue\\"}"}'::json[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5119
test('jsonb + jsonb arrays', async () => {
	const res1 = await diffDefault(_, jsonb().default({}), `'{}'`);
	const res2 = await diffDefault(_, jsonb().default([]), `'[]'`);
	const res3 = await diffDefault(_, jsonb().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, jsonb().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, jsonb().default({ key: "val'ue" }), `'{"key":"val''ue"}'`);
	const res6 = await diffDefault(_, jsonb().default({ key: `mo''",\`}{od` }), `'{"key":"mo''''\\\",\`}{od"}'`);
	const res7 = await diffDefault(_, jsonb().default({ key: 'mo",\\`}{od' }), `'{"key":"mo\\\",\\\\\`}{od"}'`);
	const res9 = await diffDefault(_, jsonb().default({ b: 2, a: 1 }), `'{"b":2,"a":1}'`);

	const res8 = await diffDefault(_, jsonb().array().default([]), `'{}'::jsonb[]`);
	const res12 = await diffDefault(_, jsonb().array('[][]').default([]), `'{}'::jsonb[]`);

	const res13 = await diffDefault(
		_,
		jsonb().default({ confirmed: true, not_received: true }),
		`'{"confirmed":true,"not_received":true}'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
});

test('timestamp + timestamp arrays', async () => {
	const res1 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res3 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res4 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res5 = await diffDefault(_, timestamp().defaultNow(), `now()`);
	const res6 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).defaultNow(),
		`now()`,
	);

	const res7 = await diffDefault(_, timestamp({ mode: 'date' }).array().default([]), `'{}'::timestamp[]`);
	const res8 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().default([]),
		`'{}'::timestamp(3) with time zone[]`,
	);
	const res9 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 5 }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp(5)[]`,
	);
	const res10 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115+00"}'::timestamp(3) with time zone[]`,
	);

	const res11 = await diffDefault(_, timestamp({ mode: 'string' }).array().default([]), `'{}'::timestamp[]`);
	const res12 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default([]),
		`'{}'::timestamp(3) with time zone[]`,
	);
	const res13 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23 12:53:53.115']),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);
	const res14 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 4, withTimezone: true }).array().default(['2025-05-23 12:53:53.115+03:00']),
		`'{"2025-05-23 12:53:53.115+03:00"}'::timestamp(4) with time zone[]`,
	);
	const res14_1 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 4, withTimezone: true }).default('2025-05-23 12:53:53.115+03:00'),
		`'2025-05-23 12:53:53.115+03:00'`,
	);

	const res15 = await diffDefault(_, timestamp({ mode: 'date' }).array('[][]').default([]), `'{}'::timestamp[]`);
	const res16 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array('[][]').default([]),
		`'{}'::timestamp(3) with time zone[]`,
	);
	const res17 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).array('[][]').default([[new Date('2025-05-23T12:53:53.115Z')]]),
		`'{{"2025-05-23 12:53:53.115"}}'::timestamp[]`,
	);
	const res18 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array('[][]').default([[
			new Date('2025-05-23T12:53:53.115Z'),
		]]),
		`'{{"2025-05-23 12:53:53.115+00"}}'::timestamp(3) with time zone[]`,
	);

	const res19 = await diffDefault(_, timestamp({ mode: 'string' }).array('[][]').default([]), `'{}'::timestamp[]`);
	const res20 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array('[][]').default([]),
		`'{}'::timestamp(3) with time zone[]`,
	);
	const res21 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array('[][]').default([['2025-05-23 12:53:53.115']]),
		`'{{"2025-05-23 12:53:53.115"}}'::timestamp[]`,
	);
	const res22 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array('[][]').default([[
			'2025-05-23 12:53:53.115',
		]]),
		`'{{"2025-05-23 12:53:53.115+00"}}'::timestamp(3) with time zone[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res14_1).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
	expect.soft(res22).toStrictEqual([]);
});

test('time + time arrays', async () => {
	const res1 = await diffDefault(_, time().default('15:50:33'), `'15:50:33'`);
	const res2 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123+00'),
		`'15:50:33.123+00'`,
	);
	const res3 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123+00'`,
	);
	const res4 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123+03'),
		`'15:50:33.123+03'`,
	);
	const res5 = await diffDefault(_, time().defaultNow(), `now()`);
	const res6 = await diffDefault(_, time({ precision: 3, withTimezone: true }).defaultNow(), `now()`);

	const res7 = await diffDefault(_, time().array().default([]), `'{}'::time[]`);
	const res8 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default([]),
		`'{}'::time(3) with time zone[]`,
	);
	const res9 = await diffDefault(_, time({ precision: 3 }).array().default(['15:50:33']), `'{15:50:33}'::time(3)[]`);
	const res10 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123+00}'::time(3) with time zone[]`,
	);

	const res11 = await diffDefault(_, time().array('[][]').default([]), `'{}'::time[]`);
	const res12 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array('[][]').default([]),
		`'{}'::time(3) with time zone[]`,
	);
	const res13 = await diffDefault(_, time().array('[][]').default([['15:50:33']]), `'{{15:50:33}}'::time[]`);
	const res14 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array('[][]').default([['15:50:33.123']]),
		`'{{15:50:33.123+00}}'::time(3) with time zone[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
});

test('date + date arrays', async () => {
	const res1 = await diffDefault(_, date({ mode: 'string' }).default('2025-05-23'), `'2025-05-23'`);
	const res10 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res2 = await diffDefault(_, date({ mode: 'string' }).defaultNow(), `now()`);
	const res20 = await diffDefault(_, date({ mode: 'date' }).defaultNow(), `now()`);

	const res3 = await diffDefault(_, date({ mode: 'string' }).array().default([]), `'{}'::date[]`);
	const res30 = await diffDefault(_, date({ mode: 'date' }).array().default([]), `'{}'::date[]`);
	const res4 = await diffDefault(_, date({ mode: 'string' }).array().default(['2025-05-23']), `'{2025-05-23}'::date[]`);
	const res40 = await diffDefault(
		_,
		date({ mode: 'date' }).array().default([new Date('2025-05-23')]),
		`'{2025-05-23}'::date[]`,
	);

	const res5 = await diffDefault(_, date({ mode: 'string' }).array('[][]').default([]), `'{}'::date[]`);
	const res50 = await diffDefault(_, date({ mode: 'date' }).array('[][]').default([]), `'{}'::date[]`);
	const res6 = await diffDefault(
		_,
		date({ mode: 'string' }).array('[][]').default([['2025-05-23']]),
		`'{{2025-05-23}}'::date[]`,
	);
	const res60 = await diffDefault(
		_,
		date({ mode: 'date' }).array('[][]').default([[new Date('2025-05-23')]]),
		`'{{2025-05-23}}'::date[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);

	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);

	expect.soft(res5).toStrictEqual([]);
	expect.soft(res50).toStrictEqual([]);

	expect.soft(res6).toStrictEqual([]);
	expect.soft(res60).toStrictEqual([]);
});

test('interval + interval arrays', async () => {
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

	const res4 = await diffDefault(_, interval().array('[][]').default([]), `'{}'::interval[]`);
	const res40 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array('[][]').default([]),
		`'{}'::interval day to second(3)[]`,
	);

	const res5 = await diffDefault(_, interval().array('[][]').default([['1 day']]), `'{{"1 day"}}'::interval[]`);
	const res50 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array('[][]').default([['1 day 3 second']]),
		`'{{"1 day 3 second"}}'::interval day to second(3)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res10.length).toBe(1);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);

	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res30.length).toBe(1);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res50.length).toBe(1);
});

test('point + point arrays', async () => {
	const res1 = await diffDefault(_, point({ mode: 'xy' }).default({ x: 1, y: 2 }), `'(1,2)'`);
	const res2 = await diffDefault(_, point({ mode: 'tuple' }).default([1, 2]), `'(1,2)'`);

	const res3 = await diffDefault(_, point({ mode: 'tuple' }).array().default([]), `'{}'::point[]`);
	const res4 = await diffDefault(_, point({ mode: 'tuple' }).array().default([[1, 2]]), `'{"(1,2)"}'::point[]`);

	const res5 = await diffDefault(_, point({ mode: 'xy' }).array().default([]), `'{}'::point[]`);
	const res6 = await diffDefault(_, point({ mode: 'xy' }).array().default([{ x: 1, y: 2 }]), `'{"(1,2)"}'::point[]`);

	const res7 = await diffDefault(_, point({ mode: 'tuple' }).array('[][]').default([]), `'{}'::point[]`);
	const res8 = await diffDefault(
		_,
		point({ mode: 'tuple' }).array('[][]').default([[[1, 2]]]),
		`'{{"(1,2)"}}'::point[]`,
	);

	const res9 = await diffDefault(_, point({ mode: 'xy' }).array('[][]').default([]), `'{}'::point[]`);
	const res10 = await diffDefault(
		_,
		point({ mode: 'xy' }).array('[][]').default([[{ x: 1, y: 2 }]]),
		`'{{"(1,2)"}}'::point[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

test('line + line arrays', async () => {
	const res1 = await diffDefault(_, line({ mode: 'abc' }).default({ a: 1, b: 2, c: 3 }), `'{1,2,3}'`);
	const res2 = await diffDefault(_, line({ mode: 'tuple' }).default([1, 2, 3]), `'{1,2,3}'`);

	const res3 = await diffDefault(_, line({ mode: 'tuple' }).array().default([]), `'{}'::line[]`);
	const res4 = await diffDefault(_, line({ mode: 'tuple' }).array().default([[1, 2, 3]]), `'{"{1,2,3}"}'::line[]`);

	const res5 = await diffDefault(_, line({ mode: 'abc' }).array().default([]), `'{}'::line[]`);
	const res6 = await diffDefault(
		_,
		line({ mode: 'abc' }).array().default([{ a: 1, b: 2, c: 3 }]),
		`'{"{1,2,3}"}'::line[]`,
	);

	const res7 = await diffDefault(_, line({ mode: 'tuple' }).array('[][]').default([]), `'{}'::line[]`);
	const res8 = await diffDefault(
		_,
		line({ mode: 'tuple' }).array('[][]').default([[[1, 2, 3]]]),
		`'{{"{1,2,3}"}}'::line[]`,
	);

	const res9 = await diffDefault(_, line({ mode: 'abc' }).array('[][]').default([]), `'{}'::line[]`);
	const res10 = await diffDefault(
		_,
		line({ mode: 'abc' }).array('[][]').default([[{ a: 1, b: 2, c: 3 }]]),
		`'{{"{1,2,3}"}}'::line[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

test('enum + enum arrays', async () => {
	const moodEnum = pgEnum('mood_enum', [
		'sad',
		'ok',
		'ha\\ppy',
		`text'text"`,
		`no,''"\`rm`,
		"mo''\",\\`}{od",
		'mo\`od',
	]);
	const pre = { moodEnum };

	const res1 = await diffDefault(_, moodEnum().default('ok'), `'ok'::"mood_enum"`, pre);
	const res2 = await diffDefault(_, moodEnum().default('ha\\ppy'), `'ha\\ppy'::"mood_enum"`, pre);
	const res3 = await diffDefault(_, moodEnum().default(`mo''",\\\`}{od`), `'mo''''",\\\`}{od'::"mood_enum"`, pre);
	const res4 = await diffDefault(_, moodEnum().default(`text'text"`), `'text''text"'::"mood_enum"`, pre);

	const res5 = await diffDefault(_, moodEnum().array().default([]), `'{}'::"mood_enum"[]`, pre);
	const res6 = await diffDefault(_, moodEnum().array().default(['ok']), `'{ok}'::"mood_enum"[]`, pre);
	const res7 = await diffDefault(_, moodEnum().array().default(['ha\\ppy']), `'{"ha\\\\ppy"}'::"mood_enum"[]`, pre);
	const res8 = await diffDefault(_, moodEnum().array().default(['mo\`od']), `'{mo\`od}'::"mood_enum"[]`, pre);
	const res9 = await diffDefault(_, moodEnum().array('[][]').default([]), `'{}'::"mood_enum"[]`, pre);
	const res10 = await diffDefault(_, moodEnum().array('[][]').default([['ok']]), `'{{ok}}'::"mood_enum"[]`, pre);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

test('uuid + uuid arrays', async () => {
	const res1 = await diffDefault(
		_,
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		`'550e8400-e29b-41d4-a716-446655440000'`,
	);
	const res2 = await diffDefault(_, uuid().defaultRandom(), `gen_random_uuid()`);

	const res3 = await diffDefault(_, uuid().array().default([]), `'{}'::uuid[]`);
	const res4 = await diffDefault(_, uuid().array('[][]').default([]), `'{}'::uuid[]`);

	const res5 = await diffDefault(
		_,
		uuid().array().default(['550e8400-e29b-41d4-a716-446655440000']),
		`'{550e8400-e29b-41d4-a716-446655440000}'::uuid[]`,
	);

	const res6 = await diffDefault(
		_,
		uuid().array('[][]').default([['550e8400-e29b-41d4-a716-446655440000']]),
		`'{{550e8400-e29b-41d4-a716-446655440000}}'::uuid[]`,
	);

	const res7 = await diffDefault(
		_,
		uuid()
			.default(sql`'550e8400-e29b-41d4-a716-446655440001'`),
		`'550e8400-e29b-41d4-a716-446655440001'`,
	);

	const res8 = await diffDefault(_, uuid().defaultRandom(), `gen_random_uuid()`);
	const res9 = await diffDefault(_, uuid().array().default([]), `'{}'::uuid[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
});

// pgvector extension
// https://github.com/drizzle-team/drizzle-orm/issues/4473
test('bit + bit arrays', async () => {
	// await _.db.query('create extension vector;');
	const res1 = await diffDefault(_, bit({ dimensions: 3 }).default(`101`), `'101'`);
	const res2 = await diffDefault(_, bit({ dimensions: 3 }).default(sql`'101'`), `'101'`);

	const res3 = await diffDefault(_, bit({ dimensions: 3 }).array().default([]), `'{}'::bit(3)[]`);
	const res4 = await diffDefault(_, bit({ dimensions: 3 }).array().default([`101`]), `'{101}'::bit(3)[]`);

	const res5 = await diffDefault(_, bit({ dimensions: 3 }).array('[][]').default([]), `'{}'::bit(3)[]`);
	const res6 = await diffDefault(
		_,
		bit({ dimensions: 3 }).array('[][]').default([[`101`], [`101`]]),
		`'{{101},{101}}'::bit(3)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('halfvec + halfvec arrays', async () => {
	const res1 = await diffDefault(_, halfvec({ dimensions: 3 }).default([0, -2, 3]), `'[0,-2,3]'`);

	const res3 = await diffDefault(_, halfvec({ dimensions: 3 }).array().default([]), `'{}'::halfvec(3)[]`);
	const res4 = await diffDefault(
		_,
		halfvec({ dimensions: 3 }).array().default([[0, -2, 3]]),
		`'{"[0,-2,3]"}'::halfvec(3)[]`,
	);

	const res6 = await diffDefault(_, halfvec({ dimensions: 3 }).array('[][]').default([]), `'{}'::halfvec(3)[]`);
	const res7 = await diffDefault(
		_,
		halfvec({ dimensions: 3 }).array('[][]').default([[[0, -2, 3]], [[1, 2, 3]]]),
		`'{{"[0,-2,3]"},{"[1,2,3]"}}'::halfvec(3)[]`,
	);

	// TODO strange rounding
	// looks like extension or postgres makes this

	// const res2 = await diffDefault(
	// 	_,
	// 	halfvec({ dimensions: 3 }).default([0, -2.123456789, 3.123456789]),
	// 	`'[0,-2.123456789,3.123456789]'`,
	// );
	// const res5 = await diffDefault(
	// 	_,
	// 	halfvec({ dimensions: 3 }).array().default([[0, -2.3, 3.123456789]]),
	// 	`'{"[0,-2.123456789,3.123456789]"}'::halfvec(3)[]`,
	// );
	// const res8 = await diffDefault(
	// 	_,
	// 	//                                                 [[[0, -2.1230469,3.1230469      ]],[[1.1230469,2.1230469,3.1230469]]]
	// 	halfvec({ dimensions: 3 }).array('[][]').default([[[0, -2.123456, 3.123456]], [[1.123456, 2.123456, 3.123456]]]),
	// 	`'{{"[0,-2.123456789,3.123456789]"},{"[1.123456789,2.123456789,3.123456789]"}}'::halfvec(3)[]`,
	// );

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);

	// expect.soft(res2).toStrictEqual([]);
	// expect.soft(res5).toStrictEqual([]);
	// expect.soft(res8).toStrictEqual([]);
});

test('sparsevec + sparsevec arrays', async () => {
	const res1 = await diffDefault(_, sparsevec({ dimensions: 5 }).default(`{1:-1,3:2,5:3}/5`), `'{1:-1,3:2,5:3}/5'`);
	const res2 = await diffDefault(
		_,
		sparsevec({ dimensions: 5 }).default(`{1:-1.1234567,3:2.1234567,5:3.1234567}/5`),
		`'{1:-1.1234567,3:2.1234567,5:3.1234567}/5'`,
	);

	const res3 = await diffDefault(_, sparsevec({ dimensions: 5 }).array().default([]), `'{}'::sparsevec(5)[]`);
	const res4 = await diffDefault(
		_,
		sparsevec({ dimensions: 5 }).array().default([`{1:-1,3:2,5:3}/5`]),
		`'{"{1:-1,3:2,5:3}/5"}'::sparsevec(5)[]`,
	);
	const res5 = await diffDefault(
		_,
		sparsevec({ dimensions: 5 }).array().default(['{1:-1.1234567,3:2.1234567,5:3.1234567}/5']),
		`'{"{1:-1.1234567,3:2.1234567,5:3.1234567}/5"}'::sparsevec(5)[]`,
	);

	const res6 = await diffDefault(_, sparsevec({ dimensions: 5 }).array('[][]').default([]), `'{}'::sparsevec(5)[]`);
	const res7 = await diffDefault(
		_,
		sparsevec({ dimensions: 5 }).array('[][]').default([[`{1:-1,3:2,5:3}/5`], [`{1:-1,3:2,5:3}/5`]]),
		`'{{"{1:-1,3:2,5:3}/5"},{"{1:-1,3:2,5:3}/5"}}'::sparsevec(5)[]`,
	);
	const res8 = await diffDefault(
		_,
		sparsevec({ dimensions: 5 }).array('[][]').default([['{1:-1.1234567,3:2.1234567,5:3.1234567}/5'], [
			'{1:-1.1234567,3:2.1234567,5:3.1234567}/5',
		]]),
		`'{{"{1:-1.1234567,3:2.1234567,5:3.1234567}/5"},{"{1:-1.1234567,3:2.1234567,5:3.1234567}/5"}}'::sparsevec(5)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
});

test('macaddr + macaddr arrays', async () => {
	const res1 = await diffDefault(_, macaddr().default('08:00:2b:01:02:03'), `'08:00:2b:01:02:03'`);
	const res2 = await diffDefault(_, macaddr().default('ff:ff:ff:ff:ff:ff'), `'ff:ff:ff:ff:ff:ff'`);

	const res3 = await diffDefault(_, macaddr().array().default([]), `'{}'::macaddr[]`);
	const res4 = await diffDefault(
		_,
		macaddr().array().default(['08:00:2b:01:02:03']),
		`'{08:00:2b:01:02:03}'::macaddr[]`,
	);
	const res5 = await diffDefault(
		_,
		macaddr().array('[][]').default([['08:00:2b:01:02:03'], ['ff:ff:ff:ff:ff:ff']]),
		`'{{08:00:2b:01:02:03},{ff:ff:ff:ff:ff:ff}}'::macaddr[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});
test('macaddr8 + macaddr8 arrays', async () => {
	const res1 = await diffDefault(_, macaddr8().default('08:00:2b:01:02:03:04:05'), `'08:00:2b:01:02:03:04:05'`);
	const res2 = await diffDefault(_, macaddr8().default('ff:ff:ff:ff:ff:ff:ff:ff'), `'ff:ff:ff:ff:ff:ff:ff:ff'`);

	const res3 = await diffDefault(_, macaddr8().array().default([]), `'{}'::macaddr8[]`);
	const res4 = await diffDefault(
		_,
		macaddr8().array().default(['08:00:2b:01:02:03:04:05']),
		`'{08:00:2b:01:02:03:04:05}'::macaddr8[]`,
	);
	const res5 = await diffDefault(
		_,
		macaddr8().array('[][]').default([['08:00:2b:01:02:03:04:05'], ['ff:ff:ff:ff:ff:ff:ff:ff']]),
		`'{{08:00:2b:01:02:03:04:05},{ff:ff:ff:ff:ff:ff:ff:ff}}'::macaddr8[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('vector + vector arrays', async () => {
	const res1 = await diffDefault(_, vector({ dimensions: 3 }).default([0, -2, 3]), `'[0,-2,3]'`);
	const res2 = await diffDefault(
		_,
		vector({ dimensions: 3 }).default([0, -2.1234567, 3.1234567]),
		`'[0,-2.1234567,3.1234567]'`,
	);

	const res3 = await diffDefault(_, vector({ dimensions: 3 }).array().default([]), `'{}'::vector(3)[]`);
	const res4 = await diffDefault(
		_,
		vector({ dimensions: 3 }).array().default([[0, -2, 3]]),
		`'{"[0,-2,3]"}'::vector(3)[]`,
	);
	const res5 = await diffDefault(
		_,
		vector({ dimensions: 3 }).array().default([[0, -2.1234567, 3.1234567]]),
		`'{"[0,-2.1234567,3.1234567]"}'::vector(3)[]`,
	);

	const res6 = await diffDefault(_, vector({ dimensions: 3 }).array('[][]').default([]), `'{}'::vector(3)[]`);
	const res7 = await diffDefault(
		_,
		vector({ dimensions: 3 }).array('[][]').default([[[0, -2, 3]], [[1, 2, 3]]]),
		`'{{"[0,-2,3]"},{"[1,2,3]"}}'::vector(3)[]`,
	);
	const res8 = await diffDefault(
		_,
		vector({ dimensions: 3 }).array('[][]').default([[
			[0, -2.1234567, 3.1234567],
		], [[1.1234567, 2.1234567, 3.1234567]]]),
		`'{{"[0,-2.1234567,3.1234567]"},{"[1.1234567,2.1234567,3.1234567]"}}'::vector(3)[]`,
	);

	const res9 = await diffDefault(_, vector({ dimensions: 2 }).default([0, -2]), `'[0,-2]'`);
	const res10 = await diffDefault(_, vector({ dimensions: 5 }).default([0, -2, 0, 0, 0]), `'[0,-2,0,0,0]'`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

// postgis extension
// SRID=4326 -> these coordinates are longitude/latitude values
// Default is 0 or undefined
test('geometry + geometry arrays', async () => {
	const postgisDb = await preparePostgisTestDatabase();

	const res1 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).default([30.5234, 50.4501]),
		`'SRID=4326;POINT(30.5234 50.4501)'`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res2 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }),
		`'SRID=4326;POINT(30.5234 50.4501)'`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res3 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([]),
		`'{}'::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);
	const res4 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([[30.5234, 50.4501]]),
		`ARRAY['SRID=4326;POINT(30.5234 50.4501)']::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res5 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([]),
		`'{}'::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);
	const res6 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([{ x: 30.5234, y: 50.4501 }]),
		`ARRAY['SRID=4326;POINT(30.5234 50.4501)']::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res7 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array('[][]').default([]),
		`'{}'::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);
	const res8 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array('[][]').default([[[30.5234, 50.4501]], [[
			30.5234,
			50.4501,
		]]]),
		`ARRAY[ARRAY['SRID=4326;POINT(30.5234 50.4501)'],ARRAY['SRID=4326;POINT(30.5234 50.4501)']]::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res9 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).array('[][]').default([]),
		`'{}'::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res10 = await diffDefault(
		postgisDb,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).array('[][]').default([[{ x: 30.5234, y: 50.4501 }], [{
			x: 30.5234,
			y: 50.4501,
		}]]),
		`ARRAY[ARRAY['SRID=4326;POINT(30.5234 50.4501)'],ARRAY['SRID=4326;POINT(30.5234 50.4501)']]::geometry(point,4326)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res11 = await diffDefault(
		postgisDb,
		geometry({ mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }),
		`'POINT(30.5234 50.4501)'`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res12 = await diffDefault(
		postgisDb,
		geometry({ mode: 'xy', type: 'point' }).default(sql`'SRID=4326;POINT(10 10)'`),
		`'SRID=4326;POINT(10 10)'`,
		undefined,
		undefined,
		['table'],
		['public'],
	);
	// const res12_1 = await diffDefault(
	// 	postgisDb,
	// 	geometry().default(sql`'SRID=0;POINT(12.1 12.1)'`),
	// 	`'SRID=0;POINT(12.1 12.1)'`,
	// 	undefined,
	// 	undefined,
	// 	true,
	// );

	const res13 = await diffDefault(
		postgisDb,
		geometry({ mode: 'xy', type: 'point' }).array().default([{ x: 13, y: 13 }]),
		`ARRAY['POINT(13 13)']::geometry(point)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	// this will result diffs on push only
	// i believe we should not handle this since will be log in console for user about diff and this is sql``
	// const res14 = await diffDefault(
	// 	postgisDb,
	// 	geometry({ mode: 'xy', type: 'point' }).array().default(sql`'{SRID=4326;POINT(14 14)}'::geometry(point)[]`),
	// 	`'{SRID=4326;POINT(14 14)}'::geometry(point)[]`,
	// 	undefined,
	// 	undefined,
	// 	true,
	// );

	const res15 = await diffDefault(
		postgisDb,
		geometry({ mode: 'xy', type: 'point' }).array().default(sql`ARRAY['SRID=4326;POINT(15 15)']::geometry(point)[]`),
		`ARRAY['SRID=4326;POINT(15 15)']::geometry(point)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	const res16 = await diffDefault(
		postgisDb,
		geometry({ mode: 'xy', type: 'point' }).array().default(sql`ARRAY['POINT(16 16)']::geometry(point)[]`),
		`ARRAY['POINT(16 16)']::geometry(point)[]`,
		undefined,
		undefined,
		['table'],
		['public'],
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	// expect.soft(res12_1).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	// expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
});

test('inet + inet arrays', async () => {
	const res1 = await diffDefault(_, inet().default('127.0.0.1'), `'127.0.0.1'`);
	const res2 = await diffDefault(_, inet().default('::ffff:192.168.0.1/96'), `'::ffff:192.168.0.1/96'`);

	const res1_1 = await diffDefault(
		_,
		inet().array().default(['127.0.0.1', '127.0.0.2']),
		`'{127.0.0.1,127.0.0.2}'::inet[]`,
	);
	const res2_1 = await diffDefault(
		_,
		inet().array().default(['::ffff:192.168.0.1/96']),
		`'{::ffff:192.168.0.1/96}'::inet[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);

	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
});

test('cidr + cidr arrays', async () => {
	const res1 = await diffDefault(_, cidr().default('127.0.0.1/32'), `'127.0.0.1/32'`);

	const res2_1 = await diffDefault(_, cidr().array().default([]), `'{}'::cidr[]`);
	const res2_2 = await diffDefault(
		_,
		cidr().array().default(['127.0.0.1/32', '127.0.0.2/32']),
		`'{127.0.0.1/32,127.0.0.2/32}'::cidr[]`,
	);

	expect.soft(res1).toStrictEqual([]);

	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res2_2).toStrictEqual([]);
});

test.skip('corner cases', async () => {
	const moodEnum = pgEnum('mood_enum', ['sad', 'ok', 'happy', `text'text"`, `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od']);
	const pre = { moodEnum };

	await diffDefault(
		_,
		moodEnum().array('[][]').default([[`text'text"`]]),
		`'{{"text''text\\\""}}'::"mood_enum"[]`,
		pre,
	);
	const res11 = await diffDefault(
		_,
		moodEnum().array('[][]').default([[`mo''",\`}{od`]]),
		`'{{"mo''''\\\",\`\}\{od"}}'::"mood_enum"[]`,
		pre,
	);

	const res6 = await diffDefault(
		_,
		moodEnum().array().default([`text'text"`]),
		`'{"text''text\\\""}'::"mood_enum"[]`,
		pre,
	);

	const res7 = await diffDefault(
		_,
		moodEnum().array().default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`\}\{od"}'::"mood_enum"[]`,
		pre,
	);

	// const res_10 = await diffDefault(
	// 	_,
	// 	json().array().default([{ key: `mo''",\`}{od` }]),
	// 	`'{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}'::json[]`,
	// );
	// expect.soft(res_10).toStrictEqual([]);

	// 	const res14 = await diffDefault(
	// 	_,
	// 	json().array('[][]').default([[{ key: `mo''",\`}{od` }]]),
	// 	`'{{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}}'::json[]`,
	// );
	// expect.soft(res14).toStrictEqual([]);

	// const res__10 = await diffDefault(
	// 	_,
	// 	json().array().default([{ key: `mo''",\`}{od` }]),
	// 	`'{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}'::json[]`,
	// );
	// expect.soft(res__10).toStrictEqual([]);

	const res__14 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array('[][]')
			.default(
				[[`mo''",\`}{od`], [`mo''",\`}{od`]],
			),
		`'{{"mo''''\\\",\`\}\{od"},{"mo''''\\\",\`}{od"}}'::text[]`,
	);
	expect.soft(res__14).toStrictEqual([]);

	// 		const res14 = await diffDefault(
	// 	_,
	// 	json().array('[][]').default([[{ key: `mo''",\`}{od` }]]),
	// 	`'{{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}}'::json[]`,
	// );

	// expect.soft(res14).toStrictEqual([]);

	const res_11 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''''\\\",\`\}\{od"}'::text[]`,
	);
	expect.soft(res_11).toStrictEqual([]);

	const res21 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array('[][]').default([[10.123, 123.10], [10.123, 123.10]]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);
	const res22 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array('[][]').default([[10.123, 123.10], [
			10.123,
			123.10,
		]]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);

	// expect.soft(res21).toStrictEqual([]);
	// expect.soft(res22).toStrictEqual([]);

	await diffDefault(
		_,
		json().array().default([{ key: 'mo",\\`}{od' }]),
		`'{"{\"key\":\"mo\\\",\\\\\\\\\`}{od\"}"}'::json[]`,
	);

	await diffDefault(
		_,
		json().array().default([{ key: 'mo",\\`}{od' }]),
		`'{"{\"key\":\"mo\\\",\\\\\\\\\`}{od\"}"}'::json[]`,
	);

	await diffDefault(_, json().array('[][]').default([]), `'{}'::json[]`);
	await diffDefault(
		_,
		json().array('[][]').default([[{ key: 'value' }]]),
		`'{{\"{\\\"key\\\":\\\"value\\\"}\"}}'::json[]`,
	);
	await diffDefault(
		_,
		json().array('[][]').default([[{ key: "val'ue" }]]),
		`'{{"{\\"key\\":\\"val''ue\\"}"}}'::json[]`,
	);
	await diffDefault(
		_,
		json().array('[][]').default([[{ key: 'mo",\\`}{od' }]]),
		`'{{"{\"key\":\"mo\\\",\\\\\\\\\`}{od\"}"}}'::json[]`,
	);
	await diffDefault(
		_,
		json().default(sql`jsonb_build_object('chunkIndex', NULL, 'totalChunks', NULL)`),
		`jsonb_build_object('chunkIndex', NULL, 'totalChunks', NULL)`,
	);

	await diffDefault(
		_,
		json().array('[][]').default([[{ key: 'mo",\\`}{od' }]]),
		`'{{"{\"key\":\"mo\\\",\\\\\\\\\`}{od\"}"}}'::json[]`,
	);

	await diffDefault(
		_,
		json().array('[][]').default([[{ key: "val'ue" }]]),
		`'{{"{\\"key\\":\\"val''ue\\"}"}}'::json[]`,
	);

	await diffDefault(
		_,
		json().array('[][]').default([[{ key: 'value' }]]),
		`'{{\"{\\\"key\\\":\\\"value\\\"}\"}}'::json[]`,
	);

	await diffDefault(
		_,
		jsonb().array().default([{ key: 'value' }]),
		`'{"{\\"key\\":\\"value\\"}"}'::jsonb[]`,
	);
	await diffDefault(
		_,
		jsonb().array().default([{ key: "val'ue" }]),
		`'{"{\\"key\\":\\"val''ue\\"}"}'::jsonb[]`,
	);
});
