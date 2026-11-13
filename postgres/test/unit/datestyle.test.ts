// Date/timestamp text that isn't ISO (another DateStyle) throws a clear error on every text path (jit and
// interpreted scalars, array elements, :ms targets) instead of decoding to an Invalid Date. ±infinity is
// still an Invalid Date, and a :string target still returns the text. The live server side (startup
// DateStyle, SET datestyle mid-session, Neon HTTP) is test/integration/datestyle.test.ts.
import { describe, expect, test } from 'bun:test';
import { styleStartupParams, viaNeonProxy } from '../../src/connection.ts';
import { buildDecoders, type CodegenCol, tagArrayCol } from '../../src/decode.ts';
import { RowMappers } from '../../src/mapper.ts';
import { dataRow } from '../helpers/wire.ts';

// The same instant in every DateStyle: what the server prints for '2024-02-03 12:34:56.789+00' in UTC.
const NON_ISO = [
	['German', '03.02.2024 12:34:56.789 UTC', '03.02.2024'],
	['SQL, DMY', '03/02/2024 12:34:56.789 UTC', '03/02/2024'],
	['SQL, MDY', '02/03/2024 12:34:56.789 UTC', '02/03/2024'],
	['Postgres, DMY', 'Sat 03 Feb 12:34:56.789 2024 UTC', '03-02-2024'],
	['Postgres, MDY', 'Sat Feb 03 12:34:56.789 2024 UTC', '02-03-2024'],
] as const;

const NOT_ISO = /cannot decode ".+" as a date or timestamp: it is not ISO text, so the session's DateStyle is not ISO/;

for (const decode of ['jit', 'interpreted'] as const) {
	describe(`non-ISO date text (${decode})`, () => {
		const mappers = new RowMappers(decode, buildDecoders());
		const map = (cols: CodegenCol[], cells: string[]) =>
			mappers.forCols(cols.map(tagArrayCol), 'array')(dataRow(cells));

		for (const [style, ts, date] of NON_ISO) {
			test(`${style}: timestamptz, timestamp and date throw`, () => {
				expect(() => map([{ name: 'v', oid: 1184 }], [ts])).toThrow(NOT_ISO);
				expect(() => map([{ name: 'v', oid: 1114 }], [ts.replace(' UTC', '')])).toThrow(NOT_ISO);
				expect(() => map([{ name: 'v', oid: 1082 }], [date])).toThrow(NOT_ISO);
			});

			test(`${style}: :ms targets and array elements throw`, () => {
				expect(() => map([{ name: 'v', oid: 1184, js: 'ms' }], [ts])).toThrow(NOT_ISO);
				expect(() => map([{ name: 'v', oid: 1185 }], [`{"${ts}"}`])).toThrow(NOT_ISO);
				expect(() => map([{ name: 'v', oid: 1182 }], [`{${date}}`])).toThrow(NOT_ISO);
			});

			test(`${style}: a :string target returns the text`, () => {
				expect(map([{ name: 'v', oid: 1184, js: 'string' }], [ts])).toEqual([ts]);
			});
		}

		test('the error quotes the cell', () => {
			expect(() => map([{ name: 'v', oid: 1184 }], ['03.02.2024 12:34:56.789 UTC'])).toThrow(
				'cannot decode "03.02.2024 12:34:56.789 UTC" as a date or timestamp',
			);
		});

		test('ISO text and ±infinity still decode', () => {
			const [a, b, c] = map(
				[{ name: 'a', oid: 1184 }, { name: 'b', oid: 1184 }, { name: 'c', oid: 1082 }],
				['2024-02-03 12:34:56.789+00', 'infinity', '-infinity'],
			) as Date[];
			expect(a!.toISOString()).toBe('2024-02-03T12:34:56.789Z');
			expect(Number.isNaN(b!.getTime())).toBe(true);
			expect(Number.isNaN(c!.getTime())).toBe(true);
		});
	});
}

describe('startup style parameters', () => {
	test('DateStyle=ISO and IntervalStyle=postgres by default', () => {
		expect(styleStartupParams(undefined, false, false)).toEqual({
			options: undefined,
			DateStyle: 'ISO',
			IntervalStyle: 'postgres',
		});
	});

	test('behind a transaction pooler only DateStyle is sent', () => {
		expect(styleStartupParams('-c search_path=x', true, false)).toEqual({
			options: '-c search_path=x',
			DateStyle: 'ISO',
			IntervalStyle: undefined,
		});
	});

	test('a style set in options is left to the caller', () => {
		expect(styleStartupParams('-c datestyle=German', false, false)).toEqual({
			options: '-c datestyle=German',
			DateStyle: undefined,
			IntervalStyle: 'postgres',
		});
		expect(styleStartupParams('-c IntervalStyle=iso_8601', false, true)).toEqual({
			options: '-c IntervalStyle=iso_8601 -c DateStyle=ISO',
		});
	});

	test("through Neon's proxy the styles go into options", () => {
		expect(styleStartupParams(undefined, false, true)).toEqual({
			options: '-c DateStyle=ISO -c IntervalStyle=postgres',
		});
		expect(styleStartupParams('endpoint=ep-x', false, true)).toEqual({
			options: 'endpoint=ep-x -c DateStyle=ISO -c IntervalStyle=postgres',
		});
	});

	test("behind Neon's pooler the styles go into options too", () => {
		expect(styleStartupParams(undefined, true, true)).toEqual({
			options: '-c DateStyle=ISO -c IntervalStyle=postgres',
		});
	});

	test("Neon's proxy is recognised by host or by the neon-ws socket", () => {
		expect(viaNeonProxy('ep-cool-1.us-east-2.aws.neon.tech', undefined)).toBe(true);
		expect(viaNeonProxy('ep-cool-1.us-east-1.postgres.vercel-storage.com', undefined)).toBe(true);
		expect(viaNeonProxy('db.example.com', undefined)).toBe(false);
		expect(
			viaNeonProxy('db.localtest.me', Object.assign(() => {}, { [Symbol.for('drizzle-postgres.neonProxy')]: true })),
		)
			.toBe(true);
	});
});
