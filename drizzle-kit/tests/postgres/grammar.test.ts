import { splitSqlType, trimDefaultValueSuffix } from 'src/dialects/postgres/grammar';
import { expect, test } from 'vitest';

test.each([
	["'a'::my_enum", "'a'"],
	["'abc'::text", "'abc'"],
	["'abc'::character varying", "'abc'"],
	["'abc'::bpchar", "'abc'"],
	[`'{"attr":"value"}'::json`, `'{"attr":"value"}'`],
	[`'{"attr": "value"}'::jsonb`, `'{"attr": "value"}'`],
	[`'00:00:00'::time without time zone`, `'00:00:00'`],
	[`'2025-04-24 08:30:45.08+00'::timestamp with time zone`, `'2025-04-24 08:30:45.08+00'`],
	[`'2024-01-01'::date`, `'2024-01-01'`],
	[`'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid`, `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'`],
	[`now()`, `now()`],
	[`CURRENT_TIMESTAMP`, `CURRENT_TIMESTAMP`],
	[`timezone('utc'::text, now())`, `timezone('utc'::text, now())`],
	[`'{a,b}'::my_enum[]`, `'{a,b}'`],
	[`'{10,20}'::smallint[]`, `'{10,20}'`],
	[`'{10,20}'::integer[]`, `'{10,20}'`],
	[`'{99.9,88.8}'::numeric[]`, `'{99.9,88.8}'`],
	[`'{100,200}'::bigint[]`, `'{100,200}'`],
	[`'{t,f}'::boolean[]`, `'{t,f}'`],
	[`'{abc,def}'::text[]`, `'{abc,def}'`],
	[`'{abc,def}'::character varying[]`, `'{abc,def}'`],
	[`'{abc,def}'::bpchar[]`, `'{abc,def}'`],
	[`'{100,200}'::double precision[]`, `'{100,200}'`],
	[`'{100,200}'::real[]`, `'{100,200}'`],
	["'{}'::character(1)[]", "'{}'"],
	[
		`'{"{\"attr\":\"value1\"}","{\"attr\":\"value2\"}"}'::json[]`,
		`'{"{\"attr\":\"value1\"}","{\"attr\":\"value2\"}"}'`,
	],
	[
		`'{"{\"attr\": \"value1\"}","{\"attr\": \"value2\"}"}'::jsonb[]`,
		`'{"{\"attr\": \"value1\"}","{\"attr\": \"value2\"}"}'`,
	],
	[`'{00:00:00,01:00:00}'::time without time zone[]`, `'{00:00:00,01:00:00}'`],
	[
		`'{"2025-04-24 10:41:36.623+00","2025-04-24 10:41:36.623+00"}'::timestamp with time zone[]`,
		`'{"2025-04-24 10:41:36.623+00","2025-04-24 10:41:36.623+00"}'`,
	],
	[`'{2024-01-01,2024-01-02}'::date[]`, `'{2024-01-01,2024-01-02}'`],
	[
		`'{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12}'::uuid[]`,
		`'{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12}'`,
	],
	[`'{127.0.0.1,127.0.0.2}'::inet[]`, `'{127.0.0.1,127.0.0.2}'`],
	[`'{127.0.0.1/32,127.0.0.2/32}'::cidr[]`, `'{127.0.0.1/32,127.0.0.2/32}'`],
	[`'{00:00:00:00:00:00,00:00:00:00:00:01}'::macaddr[]`, `'{00:00:00:00:00:00,00:00:00:00:00:01}'`],
	[
		`'{00:00:00:ff:fe:00:00:00,00:00:00:ff:fe:00:00:01}'::macaddr8[]`,
		`'{00:00:00:ff:fe:00:00:00,00:00:00:ff:fe:00:00:01}'`,
	],
	[`'{"1 day 01:00:00","1 day 02:00:00"}'::interval[]`, `'{"1 day 01:00:00","1 day 02:00:00"}'`],
	[`(predict -> 'predictions'::text)`, `(predict -> 'predictions'::text)`],
])('trim default suffix %#: %s', (it, expected) => {
	expect(trimDefaultValueSuffix(it)).toBe(expected);
});

test('split sql type', () => {
	expect.soft(splitSqlType('numeric')).toStrictEqual({ type: 'numeric', options: null });
	expect.soft(splitSqlType('numeric(10)')).toStrictEqual({ type: 'numeric', options: '10' });
	expect.soft(splitSqlType('numeric(10,0)')).toStrictEqual({ type: 'numeric', options: '10,0' });
	expect.soft(splitSqlType('numeric(10,2)')).toStrictEqual({ type: 'numeric', options: '10,2' });

	expect.soft(splitSqlType('numeric[]')).toStrictEqual({ type: 'numeric', options: null });
	expect.soft(splitSqlType('numeric(10)[]')).toStrictEqual({ type: 'numeric', options: '10' });
	expect.soft(splitSqlType('numeric(10,0)[]')).toStrictEqual({ type: 'numeric', options: '10,0' });
	expect.soft(splitSqlType('numeric(10,2)[]')).toStrictEqual({ type: 'numeric', options: '10,2' });

	expect.soft(splitSqlType('numeric[][]')).toStrictEqual({ type: 'numeric', options: null });
	expect.soft(splitSqlType('numeric(10)[][]')).toStrictEqual({ type: 'numeric', options: '10' });
	expect.soft(splitSqlType('numeric(10,0)[][]')).toStrictEqual({ type: 'numeric', options: '10,0' });
	expect.soft(splitSqlType('numeric(10,2)[][]')).toStrictEqual({ type: 'numeric', options: '10,2' });
});

test('to default array', () => {
	// TODO: wrong test?
	// expect.soft(toDefaultArray([['one'], ['two']], 1, (it) => JSON.stringify(it))).toBe(`{["one"],["two"]}`);
	// expect.soft(toDefaultArray([{ key: 'one' }, { key: 'two' }], 1, (it) => JSON.stringify(it))).toBe(
	// 	`{{"key":"one"},{"key":"two"}}`,
	// );
});
