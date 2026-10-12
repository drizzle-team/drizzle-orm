import { describe, expect, it } from 'vitest';
import { GelDialect } from '~/gel-core/dialect.ts';
import { QueryBuilder as GelQueryBuilder } from '~/gel-core/query-builders/query-builder.ts';
import { gelTable } from '~/gel-core/table.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import { QueryBuilder as MySqlQueryBuilder } from '~/mysql-core/query-builders/query-builder.ts';
import { mysqlTable } from '~/mysql-core/table.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { QueryBuilder as PgQueryBuilder } from '~/pg-core/query-builders/query-builder.ts';
import { pgTable } from '~/pg-core/table.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { QueryBuilder as SingleStoreQueryBuilder } from '~/singlestore-core/query-builders/query-builder.ts';
import { singlestoreTable } from '~/singlestore-core/table.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { QueryBuilder as SQLiteQueryBuilder } from '~/sqlite-core/query-builders/query-builder.ts';
import { sqliteTable } from '~/sqlite-core/table.ts';
import { integer, text } from '~/pg-core/columns/index.ts';
import { sql } from '~/sql/sql.ts';
import {
	cumeDist, currentRow, denseRank, following, firstValue, lag, lastValue, lead, nthValue, ntile, percentRank,
	preceding, range, rank, rowNumber, rows, unboundedFollowing, unboundedPreceding, windowAvg, windowCount,
	windowMax, windowMin, windowSum,
} from '~/sql/functions/index.ts';

const t = pgTable('t', { a: integer('a'), b: integer('b'), value: text('value') });
const pg = new PgDialect();
const query = (expression: ReturnType<typeof rowNumber>['over'] extends (...args: any[]) => infer R ? R : never) => pg.sqlToQuery(expression);

const expectedHelpers: [string, () => any][] = [
	['row_number()', rowNumber], ['rank()', rank], ['dense_rank()', denseRank], ['percent_rank()', percentRank],
	['cume_dist()', cumeDist], ['ntile(3)', () => ntile(3)], ['first_value("t"."value")', () => firstValue(t.value)],
	['last_value("t"."value")', () => lastValue(t.value)], ['nth_value("t"."value", 2)', () => nthValue(t.value, 2)],
	['sum("t"."a")', () => windowSum(t.a)], ['avg("t"."a")', () => windowAvg(t.a)],
	['min("t"."a")', () => windowMin(t.a)], ['max("t"."a")', () => windowMax(t.a)], ['count("t"."a")', () => windowCount(t.a)],
	['count(*)', () => windowCount()],
];

describe('window functions', () => {
	it.each(expectedHelpers)('%s with empty over spec', (expected, getBuilder) => {
		expect(query(getBuilder().over()).sql).toBe(`${expected} over ()`);
		expect(query(getBuilder().over()).params).toEqual([]);
	});

	it('renders lag and lead optional arguments with inline offsets', () => {
		const cases = [
			[lag(t.a), 'lag("t"."a") over ()'], [lag(t.a, 2), 'lag("t"."a", 2) over ()'],
			[lag(t.a, 0), 'lag("t"."a", 0) over ()'], [lag(t.a, 1, sql`42`), 'lag("t"."a", 1, 42) over ()'],
			[lag(t.a, undefined, sql`42`), 'lag("t"."a", 1, 42) over ()'],
			[lead(t.a), 'lead("t"."a") over ()'], [lead(t.a, 2), 'lead("t"."a", 2) over ()'],
			[lead(t.a, 0), 'lead("t"."a", 0) over ()'], [lead(t.a, 1, sql`42`), 'lead("t"."a", 1, 42) over ()'],
		];
		for (const [builder, expected] of cases as any[]) {
			expect(query(builder.over())).toEqual({ sql: expected, params: [] });
		}
	});

	it('renders partition, order, and frames with inline numeric boundaries', () => {
		const built = query(rowNumber().over({
			partitionBy: t.a,
			orderBy: [t.b, sql`lower(${t.value})`],
			frame: rows({ from: unboundedPreceding, to: currentRow }),
		}));
		expect(built).toEqual({ sql: 'row_number() over (partition by "t"."a" order by "t"."b", lower("t"."value") rows between unbounded preceding and current row)', params: [] });
		for (const [frame, text] of [
			[rows({ from: preceding(2), to: following(1) }), 'rows between 2 preceding and 1 following'],
			[range({ from: unboundedPreceding, to: unboundedFollowing }), 'range between unbounded preceding and unbounded following'],
			[rows({ from: preceding(0), to: currentRow }), 'rows between 0 preceding and current row'],
			[range({ from: currentRow, to: following(0) }), 'range between current row and 0 following'],
		] as const) {
			const q = query(rank().over({ frame }));
			expect(q.sql).toBe(`rank() over (${text})`);
			expect(q.params).toEqual([]);
		}
	});

	it('renders named windows without parentheses', () => {
		expect(query(rowNumber().over('w'))).toEqual({ sql: 'row_number() over "w"', params: [] });
	});

	it.each([
		['pg', new PgQueryBuilder(new PgDialect()), pgTable('q', { a: integer('a') }), '"q"."a"'],
		['mysql', new MySqlQueryBuilder(new MySqlDialect()), mysqlTable('q', { a: integer('a') }), '`q`.`a`'],
		['sqlite', new SQLiteQueryBuilder(new SQLiteDialect()), sqliteTable('q', { a: integer('a') }), '"q"."a"'],
		['singlestore', new SingleStoreQueryBuilder(new SingleStoreDialect()), singlestoreTable('q', { a: integer('a') }), '`q`.`a`'],
		['gel', new GelQueryBuilder(new GelDialect()), gelTable('q', { a: integer('a') }), '"q"."a"'],
	] as const)('%s SELECT places WINDOW before ORDER BY', (_dialect, qb, table, columnSql) => {
		const result = qb.select({ a: table.a }).from(table).window('w', { partitionBy: table.a }).orderBy(table.a).toSQL();
		expect(result.sql).toContain(` window ${_dialect === 'mysql' || _dialect === 'singlestore' ? '`w`' : '"w"'} as (partition by ${columnSql}) order by ${columnSql}`);
		expect(result.params).toEqual([]);
	});

	it('validates numeric arguments and frame order', () => {
		for (const value of [0, -1, 1.5, NaN]) expect(() => ntile(value)).toThrow(new RegExp(`ntile.*${String(value)}`));
		for (const value of [0, -1, 1.5, NaN]) expect(() => nthValue(t.a, value)).toThrow(new RegExp(`nthValue.*${String(value)}`));
		for (const fn of [preceding, following]) {
			for (const value of [-1, 1.5]) expect(() => fn(value)).toThrow(new RegExp(`${fn.name}.*${String(value)}`));
		}
		for (const fn of [lag, lead]) expect(() => fn(t.a, -1)).toThrow(new RegExp(`${fn.name}.*-1`));
		expect(() => rows({ from: currentRow, to: preceding(1) })).toThrow(/from/);
		expect(() => range({ from: unboundedFollowing, to: currentRow })).toThrow(/from/);
		expect(() => rows({ from: currentRow, to: unboundedPreceding })).toThrow(/from/);
		expect(() => rows({ from: unboundedPreceding, to: unboundedPreceding })).not.toThrow();
	});

	it('validates named windows', () => {
		for (const name of ['', '   ']) {
			const message = name.length ? /whitespace/ : /non-empty/;
			expect(() => rowNumber().over(name)).toThrow(message);
			expect(() => new PgQueryBuilder(new PgDialect()).select().from(t).window(name, {})).toThrow(message);
		}
	});
});
