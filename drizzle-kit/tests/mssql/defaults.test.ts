import { sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	bit,
	char,
	date,
	datetime,
	datetime2,
	datetimeoffset,
	decimal,
	float,
	int,
	nchar,
	ntext,
	numeric,
	nvarchar,
	real,
	smallint,
	text,
	time,
	tinyint,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';
import { DB } from 'src/utils';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { diffDefault, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

test('int', async () => {
	const res1 = await diffDefault(_, int().default(10), '10');
	const res2 = await diffDefault(_, int().default(0), '0');
	const res3 = await diffDefault(_, int().default(-10), '-10');
	const res4 = await diffDefault(_, int().default(1e4), '10000');
	const res5 = await diffDefault(_, int().default(-1e4), '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('smallint', async () => {
	// 2^15 - 1
	const res1 = await diffDefault(_, smallint().default(32767), '32767');
	// -2^15
	const res2 = await diffDefault(_, smallint().default(-32768), '-32768');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('tinyint', async () => {
	const res1 = await diffDefault(_, tinyint().default(123), '123');
	const res2 = await diffDefault(_, tinyint().default(-432), '-432');
	const res3 = await diffDefault(_, tinyint().default(1), '1');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('bigint', async () => {
	// 2^53
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res2 = await diffDefault(_, bigint({ mode: 'number' }).default(-9007199254740991), '-9007199254740991');
	// 2^63 - 1;
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

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), '10.123');

	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807');
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res4 = await diffDefault(_, numeric({ mode: 'string' }).default('10.123'), '10.123');

	const res5 = await diffDefault(_, numeric({ precision: 6 }).default('10.123'), '10.123');
	const res6 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.123'), '10.123');
	const res7 = await diffDefault(_, numeric({ precision: 6, scale: 3 }).default('10.12'), '10.12');

	const res8 = await diffDefault(_, numeric({ mode: 'string', scale: 2 }).default('10.123'), '10.123');
	const res9 = await diffDefault(_, numeric({ mode: 'string', precision: 6 }).default('10.123'), '10.123');
	const res10 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), '10.123');
	const res11 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 3 }).default('10.12'), '10.12');

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
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('decimal', async () => {
	const res1 = await diffDefault(_, decimal().default('10.123'), '10.123');

	const res2 = await diffDefault(_, decimal({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807');
	const res3 = await diffDefault(_, decimal({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res4 = await diffDefault(_, decimal({ mode: 'string' }).default('10.123'), '10.123');

	const res5 = await diffDefault(_, decimal({ precision: 6 }).default('10.123'), '10.123');
	const res6 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10.123'), '10.123');
	const res7 = await diffDefault(_, decimal({ precision: 6, scale: 3 }).default('10.12'), '10.12');

	const res8 = await diffDefault(_, decimal({ mode: 'string', scale: 2 }).default('10.123'), '10.123');
	const res9 = await diffDefault(_, decimal({ mode: 'string', precision: 6 }).default('10.123'), '10.123');
	const res10 = await diffDefault(_, decimal({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), '10.123');
	const res11 = await diffDefault(_, decimal({ mode: 'string', precision: 6, scale: 3 }).default('10.12'), '10.12');

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
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('real', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');
	const res10 = await diffDefault(_, real().default(1000), '1000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

test('float', async () => {
	const res1 = await diffDefault(_, float().default(10000.123), '10000.123');
	const res10 = await diffDefault(_, float().default(10000), '10000');

	const res2 = await diffDefault(_, float({ precision: 45 }).default(10000.123), '10000.123');
	const res20 = await diffDefault(_, float({ precision: 45 }).default(10000), '10000');

	const res3 = await diffDefault(_, float({ precision: 10 }).default(10000.123), '10000.123');
	const res30 = await diffDefault(_, float({ precision: 10 }).default(10000), '10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
});

test('bit', async () => {
	const res1 = await diffDefault(_, bit().default(true), '1');
	const res2 = await diffDefault(_, bit().default(false), '0');
	const res3 = await diffDefault(_, bit().default(sql`1`), '1');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('char ', async () => {
	const res0 = await diffDefault(_, char().default('text'), `'text'`);
	const res1 = await diffDefault(_, char({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, char({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, char({ length: 256 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, char({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''\",\`}{od'`,
	);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('varchar', async () => {
	const res0 = await diffDefault(_, varchar().default('text'), `'text'`);
	const res1 = await diffDefault(_, varchar({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 256 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, varchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('text', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, text().default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('nchar ', async () => {
	const res0 = await diffDefault(_, nchar().default('text'), `'text'`);
	const res1 = await diffDefault(_, nchar({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, nchar({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, nchar({ length: 256 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, nchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		nchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''\",\`}{od'`,
	);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('nvarchar', async () => {
	const res0 = await diffDefault(_, nvarchar().default('text'), `'text'`);
	const res1 = await diffDefault(_, nvarchar({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, nvarchar({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, nvarchar({ length: 256 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, nvarchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		nvarchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('ntext', async () => {
	const res1 = await diffDefault(_, ntext().default('text'), `'text'`);
	const res2 = await diffDefault(_, ntext().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, ntext().default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, ntext({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		ntext({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('datetime', async () => {
	const res1 = await diffDefault(
		_,
		datetime({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res3 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default(sql`'2025-05-23T12:53:53.115Z'`),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res4 = await diffDefault(_, datetime().defaultGetDate(), `getdate()`);
	const res5 = await diffDefault(_, datetime().default(sql`getdate()`), `getdate()`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('datetime2', async () => {
	const res1 = await diffDefault(
		_,
		datetime2({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res10 = await diffDefault(
		_,
		datetime2({ mode: 'date', precision: 4 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2 = await diffDefault(
		_,
		datetime2({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res20 = await diffDefault(
		_,
		datetime2({ mode: 'string', precision: 3 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res3 = await diffDefault(_, datetime2().defaultGetDate(), `getdate()`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('datetimeoffset', async () => {
	const res1 = await diffDefault(
		_,
		datetimeoffset({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res2 = await diffDefault(
		_,
		datetimeoffset({ mode: 'date', precision: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res3 = await diffDefault(
		_,
		datetimeoffset({ mode: 'string' }).default('2025-05-23T12:53:53.115+03:00'),
		`'2025-05-23T12:53:53.115+03:00'`,
	);
	const res4 = await diffDefault(
		_,
		datetimeoffset({ mode: 'string', precision: 3 }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res5 = await diffDefault(_, datetimeoffset().defaultGetDate(), `getdate()`);
	const res6 = await diffDefault(
		_,
		datetimeoffset({ mode: 'date', precision: 3 }).defaultGetDate(),
		`getdate()`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('time', async () => {
	const res1 = await diffDefault(_, time().default(new Date('2025-05-23T12:53:53.115Z')), `'12:53:53.115'`);
	const res10 = await diffDefault(
		_,
		time({ mode: 'string', precision: 2 }).default('15:50:33.12342'),
		`'15:50:33.12342'`,
	);
	const res2 = await diffDefault(
		_,
		time({ mode: 'string', precision: 2 }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('date', async () => {
	const res1 = await diffDefault(_, date({ mode: 'string' }).default('2025-05-23'), `'2025-05-23'`);
	const res10 = await diffDefault(
		_,
		date({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`'2025-05-23T12:53:53.115Z'`,
	);
	const res2 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res3 = await diffDefault(_, date({ mode: 'string' }).defaultGetDate(), `getdate()`);
	const res30 = await diffDefault(_, date({ mode: 'date' }).defaultGetDate(), `getdate()`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);

	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
});

test('corner cases', async () => {
	const res1 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] })
			.default(
				`mo''",\`}{od`,
			),
		`'mo''''\",\`}{od'`,
	);
	expect.soft(res1).toStrictEqual([]);
});

function toBinary(str: string) {
	return '0x' + (Buffer.from(str, 'utf8').toString('hex')).toUpperCase();
}
test('binary + varbinary', async () => {
	const res1 = await diffDefault(_, binary().default(Buffer.from('hello world')), toBinary('hello world'));
	const res10 = await diffDefault(_, varbinary().default(Buffer.from('hello world')), toBinary('hello world'));

	const res2 = await diffDefault(
		_,
		binary({ length: 100 }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);
	const res2_1 = await diffDefault(
		_,
		varbinary({ length: 'max' }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);
	const res2_2 = await diffDefault(
		_,
		varbinary({ length: 100 }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res2_2).toStrictEqual([]);
});
