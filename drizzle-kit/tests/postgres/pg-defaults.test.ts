import { ColumnBuilder, sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	char,
	date,
	decimal,
	doublePrecision,
	integer,
	interval,
	json,
	jsonb,
	line,
	numeric,
	PgArray,
	PgDialect,
	pgEnum,
	pgSchema,
	pgTable,
	point,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { createDDL, interimToDDL } from 'src/dialects/postgres/ddl';
import { ddlDiffDry } from 'src/dialects/postgres/diff';
import { defaultFromColumn } from 'src/dialects/postgres/drizzle';
import { defaultToSQL } from 'src/dialects/postgres/grammar';
import { fromDatabase, fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { K } from 'vitest/dist/chunks/reporters.d.DG9VKi4m';
import { drizzleToDDL, prepareTestDatabase, TestDatabase } from './mocks';

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

beforeEach(async () => {
	await _.clear();
});

const moodEnum = pgEnum('mood_enum', ['sad', 'ok', 'happy']);
// ddlDefaultType = ['null', 'boolean', 'number', 'string', 'bigint', 'json', 'jsonb', 'array', 'func', 'unknown']
// [drizzleColumn, drizzleDefaultValue, ddlDefaultType, sqlDefaultvalue]
const cases = [
	// integer
	[integer().default(10), '10', 'number'],
	[integer().default(0), '0', 'number'],
	[integer().default(-10), '-10', 'number'],
	[integer().default(1e4), '10000', 'number'],
	[integer().default(-1e4), '-10000', 'number'],

	// smallint
	[smallint().default(10), '10', 'number'],

	// TODO revise should ddlDefaultType equal 'bigint' ?
	// bigint
	// 2^63
	[
		bigint({ mode: 'bigint' }).default(BigInt('9223372036854775807')),
		'9223372036854775807',
		'string',
		`'9223372036854775807'`,
	],
	// 2^53
	[bigint({ mode: 'number' }).default(9007199254740992), '9007199254740992', 'number'],

	// serial
	// Because SERIAL expands to INTEGER DEFAULT nextval('table_column_seq'),
	// adding a second DEFAULT clause causes this error:
	// ERROR: multiple default values specified for column "column" of table "table"

	// numeric
	[numeric().default('10.123'), '10.123', 'string', `'10.123'`],

	// decimal
	[decimal().default('100.123'), '100.123', 'string', `'100.123'`],

	// real
	[real().default(1000.123), '1000.123', 'number'],

	// double precision
	[doublePrecision().default(10000.123), '10000.123', 'number'],

	// boolean
	[boolean(), null, null, ''],
	[boolean().default(true), 'true', 'boolean'],
	[boolean().default(false), 'false', 'boolean'],
	[boolean().default(sql`true`), 'true', 'unknown'],

	// char
	[char({ length: 256 }).default('text'), 'text', 'string', `'text'`],

	// varchar
	[varchar({ length: 10 }).default('text'), 'text', 'string', `'text'`],
	[varchar({ length: 10 }).default("text'text"), "text'text", 'string', `'text''text'`],
	[varchar({ length: 10 }).default('text\'text"'), 'text\'text"', 'string', "'text''text\"'"],
	[varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', "'one'"],

	// text
	[text().default('text'), 'text', 'string', `'text'`],
	[text().default("text'text"), "text'text", 'string', `'text''text'`],
	[text().default('text\'text"'), 'text\'text"', 'string', `'text''text"'`],
	[text({ enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', `'one'`],

	// json
	[json().default({}), '{}', 'json', `'{}'`],
	[json().default([]), '[]', 'json', `'[]'`],
	[json().default([1, 2, 3]), '[1,2,3]', 'json', `'[1,2,3]'`],
	[json().default({ key: 'value' }), '{"key":"value"}', 'json', `'{"key":"value"}'`],
	[json().default({ key: "val'ue" }), '{"key":"val\'ue"}', 'json', `'{"key":"val''ue"}'`],

	// jsonb
	[jsonb().default({}), '{}', 'jsonb', `'{}'`],
	[jsonb().default([]), '[]', 'jsonb', `'[]'`],
	[jsonb().default([1, 2, 3]), '[1,2,3]', 'jsonb', `'[1,2,3]'`],
	[jsonb().default({ key: 'value' }), '{"key":"value"}', 'jsonb', `'{"key":"value"}'`],
	[jsonb().default({ key: "val'ue" }), '{"key":"val\'ue"}', 'jsonb', `'{"key":"val''ue"}'`],

	// timestamp
	[
		timestamp().default(new Date('2025-05-23T12:53:53.115Z')),
		'2025-05-23 12:53:53.115',
		'string',
		`'2025-05-23 12:53:53.115'`,
	],
	[
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		'2025-05-23 12:53:53.115',
		'string',
		`'2025-05-23 12:53:53.115'`,
	],
	[timestamp().defaultNow(), 'now()', 'unknown', 'now()'],

	// time
	[time().default('15:50:33'), '15:50:33', 'string', `'15:50:33'`],
	[time().defaultNow(), 'now()', 'unknown', `now()`],

	// date
	[
		date().default('2025-05-23'),
		'2025-05-23',
		'string',
		`'2025-05-23'`,
	],
	[date().defaultNow(), 'now()', 'unknown', 'now()'],

	// interval
	[interval('interval').default('1 day'), '1 day', 'string', `'1 day'`],

	// point
	[point('point', { mode: 'xy' }).default({ x: 1, y: 2 }), '(1,2)', 'string', `'(1,2)'`],
	[point({ mode: 'tuple' }).default([1, 2]), '(1,2)', 'string', `'(1,2)'`],

	// line
	[line({ mode: 'abc' }).default({ a: 1, b: 2, c: 3 }), '{ a: 1, b: 2, c: 3 }', 'string', `'{1,2,3}'`],
	[line({ mode: 'tuple' }).default([1, 2, 3]), '{1,2,3}', 'string', `'{1,2,3}'`],

	// enum
	[moodEnum().default('ok'), 'ok', 'string', `'ok'`],

	// uuid
	[
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		'550e8400-e29b-41d4-a716-446655440000',
		'string',
		`'550e8400-e29b-41d4-a716-446655440000'`,
	],
	[
		uuid().defaultRandom(),
		'gen_random_uuid()',
		'unknown',
		`gen_random_uuid()`,
	],

	// Arrays------------------------------------------------------------------------------------------------------------------------------
	// integer
	[integer().array(1).default([10]), '{10}', 'array', `'{10}'::integer[]`],

	// smallint
	[smallint().array(1).default([10]), '{10}', 'array', `'{10}'::smallint[]`],

	// bigint
	// 2^63
	[
		bigint({ mode: 'bigint' }).array(1).default([BigInt('9223372036854775807')]),
		'{9223372036854775807}',
		'array',
		`'{9223372036854775807}'::bigint[]`,
	],
	// 2^53
	[
		bigint({ mode: 'number' }).array(1).default([9007199254740992]),
		'{9007199254740992}',
		'array',
		`'{9007199254740992}'::bigint[]`,
	],

	// numeric
	[numeric().array(1).default(['10.123']), '{"10.123"}', 'array', `'{"10.123"}'::numeric[]`],

	// decimal
	[decimal().array(1).default(['100.123']), '{"100.123"}', 'array', `'{"100.123"}'::numeric[]`],

	// real
	[real().array(1).default([1000.123]), '{1000.123}', 'array', `'{1000.123}'::real[]`],

	// double precision
	[doublePrecision().array(1).default([10000.123]), '{10000.123}', 'array', `'{10000.123}'::double precision[]`],

	// boolean
	[boolean().array(1).default([true]), '{true}', 'array', `'{true}'::boolean[]`],

	// char
	[char({ length: 256 }).array(1).default(['text']), '{"text"}', 'array', `'{"text"}'::char(256)[]`],

	// varchar
	[varchar({ length: 10 }).array(1).default(['text']), '{"text"}', 'array', `'{"text"}'::varchar(10)[]`],

	// text
	[text().array(1).default(['text']), '{"text"}', 'array', `'{"text"}'::text[]`],

	// json
	[json().array(1).default([{}]), '{"{}"}', 'array', `'{"{}"}'::json[]`],

	// jsonb
	[jsonb().array(1).default([{}]), '{"{}"}', 'array', `'{"{}"}'::jsonb[]`],

	// timestamp
	[
		timestamp().array(1).default([new Date('2025-05-23T12:53:53.115Z')]),
		'{"2025-05-23T12:53:53.115Z"}',
		'array',
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp[]`,
	],

	// time
	[time().array(1).default(['15:50:33']), '{"15:50:33"}', 'array', `'{"15:50:33"}'::time[]`],

	// date
	[
		date().array(1).default(['2025-05-23']),
		'{"2025-05-23"}',
		'array',
		`'{"2025-05-23"}'::date[]`,
	],

	// interval
	[interval('interval').array(1).default(['1 day']), '{"1 day"}', 'array', `'{"1 day"}'::interval[]`],

	// point
	[point().array(1).default([[1, 2]]), '{{1,2}}', 'array', `'{{1,2}}'::point[]`],

	// line
	[line().array(1).default([[1, 2, 3]]), '{{1,2,3}}', 'array', `'{{1,2,3}}'::line[]`],

	// enum
	[moodEnum().array(1).default(['ok']), '{"ok"}', 'array', `'{"ok"}'::mood_enum[]`],

	// uuid
	[
		uuid().array(1).default(['550e8400-e29b-41d4-a716-446655440000']),
		'{"550e8400-e29b-41d4-a716-446655440000"}',
		'array',
		`'{"550e8400-e29b-41d4-a716-446655440000"}'::uuid[]`,
	],

	// Nd Arrays------------------------------------------------------------------------------------------------------------------------------
	[integer().array(1).default([1]), '{1}', 'array', `'{1}'::integer[]`],
	[integer().array(1).array(2).default([[1, 2]]), '{{1,2}}', 'array', `'{{1,2}}'::integer[][]`],
	[
		integer().array(1).array(2).array(3).default([[[1, 2, 3], [2, 3, 4]]]),
		'{{{1,2,3},{2,3,4}}}',
		'array',
		`'{{{1,2,3},{2,3,4}}}'::integer[][][]`,
	],
	[
		integer().array(1).array(2).array(3).array(2).default([[[[1, 2], [2, 3], [3, 4]], [[2, 3], [3, 4], [4, 5]]]]),
		'{{{{1,2},{2,3},{3,4}},{{2,3},{3,4},{4,5}}}}',
		'array',
		`'{{{{1,2},{2,3},{3,4}},{{2,3},{3,4},{4,5}}}}'::integer[][][][]`,
	],
] as const;

const { c0_, c0, c1, c2, c3 } = cases.reduce((acc, it) => {
	// @ts-expect-error
	const l0_ = (it[0] as ColumnBuilder).config?.baseBuilder?.config?.columnType?.length ?? 0;
	// @ts-expect-error
	const l0 = (it[0] as ColumnBuilder).config?.columnType?.length ?? 0;
	const l1 = (it[1] as string)?.length || 0;
	const l2 = (it[2] as string)?.length || 0;
	const l3 = (it[3] as string)?.length || 0;
	acc.c0_ = l0_ > acc.c0_ ? l0_ : acc.c0_;
	acc.c0 = l0 > acc.c0 ? l0 : acc.c0;
	acc.c1 = l1 > acc.c1 ? l1 : acc.c1;
	acc.c2 = l2 > acc.c2 ? l2 : acc.c2;
	acc.c3 = l3 > acc.c3 ? l3 : acc.c3;
	return acc;
}, { c0_: 0, c0: 0, c1: 0, c2: 0, c3: 0 });

for (const it of cases) {
	const [column, value, type] = it;
	const sql = it[3] || value;

	// @ts-expect-error
	const paddedDrizzleBaseType = (column.config.baseBuilder?.config?.columnType || '').padStart(c0_, ' ');
	// @ts-expect-error
	const paddedDrizzleType = (column.config.columnType || '').padStart(c0, ' ');
	const paddedType = (type || '').padStart(c2, ' ');
	const paddedValue = (value || '').padStart(c1, ' ');
	const paddedSql = (sql || '').padEnd(c3, ' ');

	const t = pgTable('table', { column });
	const dimensions = (t.column as PgArray<any, any>).size ?? 0;
	// if (dimensions === 0) continue;

	test(`default ${paddedDrizzleType} ${paddedDrizzleBaseType} | ${paddedType} | ${paddedValue} | ${paddedSql}`, async () => {
		const columnDefault = defaultFromColumn(t.column, t.column.default, dimensions, new PgDialect());
		const res = { default: columnDefault, type: t.column.getSQLType().replace(/\[\d*\]/g, ''), dimensions };

		expect.soft(res.default).toStrictEqual(value === null ? null : { value, type });
		expect.soft(defaultToSQL(res)).toStrictEqual(sql);

		const { ddl } = drizzleToDDL({ t, moodEnum });
		const { sqlStatements: init } = await ddlDiffDry(createDDL(), ddl, 'default');

		for (const statement of init) {
			await db.query(statement);
		}

		const schema = await fromDatabaseForDrizzle(db, undefined, () => true);
		const { ddl: ddl2 } = interimToDDL(schema);
		const { sqlStatements } = await ddlDiffDry(ddl2, ddl, 'default');

		expect.soft(sqlStatements).toStrictEqual([]);
	});
}
