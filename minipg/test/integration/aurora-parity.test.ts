// minipg/aurora DECODE PARITY — every type's DEFAULT decode must match the wire driver's. Each value is
// selected through BOTH transports against the SAME Postgres (aurora via the Data API, wire over TCP
// straight to the database behind it), and the decoded values must be identical. The wire driver is the
// oracle. One column per query, so a single drifting type can't mask another.
//
// Needs the aurora env from aurora.test.ts PLUS a direct URL to the database behind the Data API:
//   AURORA_PG_URL=postgres://postgres:postgres@localhost:55433/postgres   (local-data-api's backend)
// Skips when either is unset.  Run: `bun run test:aurora:live`
//
// Known gaps — the Data API's wire format can't carry these, so no client-side decode can match:
//   - NULL elements of arrays are dropped ('{happy,NULL}' arrives as one element);
//   - timetz arrives converted to UTC — same instant, original offset lost ('10:30:45+02' -> '08:30:45+00');
//   - money arrives as a bare number ('12.34', not the lc_monetary-formatted '$12.34').
// local-data-api additionally fails on NaN/±Infinity floats and bit(n) (500 / "Cannot cast to boolean")
// and returns bytea[] empty; those are emulator bugs, not part of the Data API's format.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type AuroraClient, type AuroraConfig, connect as auroraConnect } from '../../src/aurora.ts';
import { connect as wireConnect, type Connection } from '../../src/index.ts';

const PG_URL = process.env.AURORA_PG_URL;
const READY = !!(process.env.AURORA_RESOURCE_ARN && process.env.AURORA_SECRET_ARN && PG_URL);
const d = describe.skipIf(!READY);

function cfg(): AuroraConfig {
	const hasEnvCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
	return {
		resourceArn: process.env.AURORA_RESOURCE_ARN!,
		secretArn: process.env.AURORA_SECRET_ARN!,
		database: process.env.AURORA_DATABASE || undefined,
		endpoint: process.env.AURORA_DATA_API_ENDPOINT || undefined,
		credentials: hasEnvCreds ? undefined : { accessKeyId: 'localtest', secretAccessKey: 'localtest' },
	};
}

// One expression per entry, grouped by family. Everything here decodes identically on both entries.
const MATRIX: Record<string, string[]> = {
	integers: [
		'32767::int2',
		'2147483647::int4',
		'9223372036854775807::int8',
		'(-9223372036854775808)::int8',
		'26::oid',
		'count(*)',
		'sum(1)',
		'1::bigint + 1',
	],
	floats: ['3.14::float4', '0.1::float4', '2.718281828459045::float8', '1e300::float8'],
	numeric: ['12345.6789::numeric', '99.99::numeric(10,2)', "'NaN'::numeric", 'avg(1)'],
	bool: ['true', 'false'],
	text: [
		"'hello'::text",
		"'v'::varchar",
		"'abc'::char(5)",
		`'x'::"char"`,
		"'nm'::name",
		"'café ☕ 😀'::text",
		"''::text",
		"'<a>1</a>'::xml",
		"'int4'::regtype",
	],
	bytea: ["'\\xdeadbeef'::bytea", "''::bytea"],
	uuid: ["'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid"],
	json: [
		`'{"a":1,"b":[2,3]}'::json`,
		`'{"x":true,"y":null}'::jsonb`,
		"'[1,2,3]'::jsonb",
		`'{"n": 9007199254740993}'::jsonb`,
		`'"s"'::jsonb`,
		"'null'::jsonb",
	],
	temporal: [
		"'2024-01-15'::date",
		'current_date',
		"'2024-01-15 10:30:45.123456'::timestamp",
		"'2024-01-15 10:30:45.123456+02'::timestamptz",
		"'2024-01-15 10:30:45+00'::timestamptz",
		"'10:30:45'::time",
		"'10:30:45.5'::time",
		"'3 mons 4 days 05:06:07'::interval",
		"'-1 day'::interval",
		'now() - now()',
	],
	network: [
		"'192.168.1.1'::inet",
		"'10.0.0.0/8'::cidr",
		"'08:00:2b:01:02:03'::macaddr",
		"'08:00:2b:01:02:03:04:05'::macaddr8",
	],
	varbit: ["B'1011'::varbit"],
	ranges: [
		"'[1,5)'::int4range",
		"'[1.5,3.5]'::numrange",
		"'[2024-01-01,2024-02-01)'::tsrange",
		"'[2024-01-01 00:00+00,2024-02-01 00:00+00)'::tstzrange",
		"'[2024-01-01,2024-02-01)'::daterange",
		"'[1,9007199254740993)'::int8range",
	],
	geometric: ["'(1,2)'::point", "'<(1,2),3>'::circle", "'{1,2,3}'::line", "'((0,0),(1,1))'::box"],
	search: ["'a b'::tsvector", "'a & b'::tsquery"],
	'user-defined': ["'happy'::parity_mood", 'row(1,2)::parity_pt', '5::parity_posint', 'row(1,2)'],
	nulls: ['null::int4', 'null::text', 'null::timestamptz', 'null::jsonb', 'null::uuid', 'null::int4[]', 'null'],
	arrays: [
		"'{1,2,3}'::int2[]",
		"'{1,2,3}'::int4[]",
		"'{1,9007199254740993}'::int8[]",
		`'{a,b,"c d"}'::text[]`,
		`'{""}'::text[]`,
		"'{}'::int4[]",
		"'{{1,2},{3,4}}'::int4[]",
		"'{1.5,2.5}'::float4[]",
		"'{1.50,2}'::numeric[]",
		"'{t,f}'::bool[]",
		"'{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}'::uuid[]",
		`array['{"a":1}']::jsonb[]`,
		`array['{"a":1}']::json[]`,
		"'{2024-01-15}'::date[]",
		`'{"2024-01-15 10:30:45"}'::timestamp[]`,
		`'{"2024-01-15 10:30:45+02"}'::timestamptz[]`,
		"'{10:30:45}'::time[]",
		"'{1 day}'::interval[]",
		"'{v}'::varchar[]",
		"'{ab}'::char(2)[]",
		"'{1}'::oid[]",
		"'{a}'::name[]",
		`'{"[1,5)"}'::int4range[]`,
		`'{"[1,2)"}'::int8range[]`,
	],
	// no element decoder on either entry -> both return the raw literal, so quoting must match array_out
	'raw-literal arrays': [
		"'{192.168.1.1}'::inet[]",
		"'{10.0.0.0/8}'::cidr[]",
		"'{happy}'::parity_mood[]",
		`'{"(1,2)"}'::point[]`,
		"array['((0,0),(1,1))'::box, '((2,2),(3,3))'::box]",
		"'{a:1}'::tsvector[]",
		"'{1}'::xml[]",
		"array['(1,2)'::parity_pt]",
	],
};

d('minipg/aurora decode parity vs the wire driver (same backend)', () => {
	let wire: Connection;
	let wireString: Connection;
	let aurora: AuroraClient;
	let auroraString: AuroraClient;

	beforeAll(async () => {
		wire = await wireConnect(PG_URL!);
		wireString = await wireConnect({ url: PG_URL!, temporal: 'string' });
		// the Data API reports instants in UTC; pin the wire session so temporal:'string' text is comparable
		for (const c of [wire, wireString]) await c.query("set timezone to 'UTC'");
		aurora = await auroraConnect(cfg());
		auroraString = await auroraConnect({ ...cfg(), temporal: 'string' });
		await aurora.query('drop type if exists parity_mood cascade');
		await aurora.query("create type parity_mood as enum ('sad','ok','happy')");
		await aurora.query('drop type if exists parity_pt cascade');
		await aurora.query('create type parity_pt as (x int, y int)');
		await aurora.query('drop domain if exists parity_posint cascade');
		await aurora.query('create domain parity_posint as int4 check (value > 0)');
	}, 30000); // a cold local-data-api JVM can be slow on the first calls
	afterAll(async () => {
		for (const t of ['type parity_mood', 'type parity_pt', 'domain parity_posint']) {
			await aurora?.query(`drop ${t} if exists cascade`).catch(() => {});
		}
		await wire?.end();
		await wireString?.end();
	});

	for (const [family, exprs] of Object.entries(MATRIX)) {
		test(`${family}: default decode`, async () => {
			for (const e of exprs) {
				const sql = `select ${e} as v`;
				const [a, w] = await Promise.all([
					aurora.query(sql, [], { mode: 'object' }),
					wire.query(sql, [], { mode: 'object' }),
				]);
				expect({ e, v: a.rows[0]!.v }).toEqual({ e, v: w.rows[0]!.v }); // `e` names the failing expression
			}
		});

		test(`${family}: temporal:'string'`, async () => {
			for (const e of exprs) {
				const sql = `select ${e} as v`;
				const [a, w] = await Promise.all([
					auroraString.query(sql, [], { mode: 'object' }),
					wireString.query(sql, [], { mode: 'object' }),
				]);
				expect({ e, v: a.rows[0]!.v }).toEqual({ e, v: w.rows[0]!.v });
			}
		});
	}

	test('array mode and column names match on a mixed row', async () => {
		const sql =
			"select 1 i4, 9223372036854775807::int8 i8, 1.5::float8 f8, 10.50::numeric num, '2024-06-01 12:00:00+00'::timestamptz ts, true flag, "
			+ "'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid id, 'txt'::text t, json_build_object('n',5)::jsonb j, array[1,2] arr";
		const [a, w] = await Promise.all([aurora.query(sql), wire.query(sql)]);
		expect(a.columns).toEqual(w.columns);
		expect(a.rows).toEqual(w.rows);
	});

	test("box / box[] shapes decode identically (box arrays delimit with ';')", async () => {
		const sql =
			`select '(1,2),(3,4)'::box s, array['(1,2),(3,4)'::box, '(5,6),(7,8)'::box] a, '{{"(1,1),(0,0)"};{"(2,2),(0,0)"}}'::box[] m, '{}'::box[] z`;
		const shape = { s: 'box', a: 'box[]', m: 'box[]', z: 'box[]' } as const;
		const [a, w] = await Promise.all([aurora.query(sql, [], { shape }), wire.query(sql, [], { shape })]);
		expect(a.rows).toEqual(w.rows);
		expect(a.rows[0]).toMatchObject({ a: ['(3,4),(1,2)', '(7,8),(5,6)'] });
	});

	test('serial / identity columns decode like their integer types', async () => {
		await aurora.query('drop table if exists minipg_parity_serial');
		await aurora.query(
			'create table minipg_parity_serial (a serial, b bigserial, c smallserial, d int generated always as identity, e bigint generated by default as identity)',
		);
		try {
			await aurora.query('insert into minipg_parity_serial default values');
			const sql = 'select * from minipg_parity_serial';
			const [a, w] = await Promise.all([
				aurora.query(sql, [], { mode: 'object' }),
				wire.query(sql, [], { mode: 'object' }),
			]);
			expect(a.rows).toEqual(w.rows);
		} finally {
			await aurora.query('drop table if exists minipg_parity_serial');
		}
	});
});
