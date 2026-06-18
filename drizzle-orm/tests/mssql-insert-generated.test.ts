import { describe, expect, test } from 'vitest';
import { int, MsSqlDialect, mssqlTable, nvarchar } from '~/mssql-core';
import { sql } from '~/sql';

// Regression coverage for the SQL Server `Msg 271` family — INSERT must not
// list identity or generated (computed) columns. Built without a live driver
// by emitting the dialect's INSERT directly from the query-builder config.
const dialect = new MsSqlDialect();

function insertSql(table: any, values: Record<string, unknown>): string {
	const columns = (table as any)[Symbol.for('drizzle:Columns')] ?? (table as any).constructor.prototype;
	const cfgValues = [values];
	const query = dialect.buildInsertQuery({
		table,
		values: cfgValues as any,
		output: undefined as any,
	} as any);
	return dialect.sqlToQuery(query).sql;
}

describe('mssql INSERT — generated / identity exclusion (regression for #5881)', () => {
	test('generatedAlwaysAs computed column is omitted from the INSERT column list', () => {
		const docs = mssqlTable('docs', {
			id: int().identity(),
			value: nvarchar({ length: 'max' }).notNull(),
			value_idx: nvarchar({ length: 450 }).generatedAlwaysAs(
				sql`(CONVERT([nvarchar](450),[value]))`,
			),
		});

		const out = insertSql(docs, { value: 'hello' });

		expect(out).not.toContain('[value_idx]');
		expect(out).not.toContain('[id]');
		expect(out).toContain('[value]');
	});

	test('identity column alone is still omitted (existing behavior preserved)', () => {
		const t = mssqlTable('t', {
			id: int().identity(),
			name: nvarchar({ length: 200 }).notNull(),
		});

		const out = insertSql(t, { name: 'hello' });

		expect(out).not.toContain('[id]');
		expect(out).toContain('[name]');
	});

	test('identity column that is also generatedAlwaysAs is omitted', () => {
		// Edge case the previous override missed: an identity column whose
		// generated config would have been respected by the base class is
		// still correctly excluded via the OR.
		const t = mssqlTable('t', {
			id: int().identity().generatedAlwaysAs(sql`1`),
			name: nvarchar({ length: 200 }).notNull(),
		});

		const out = insertSql(t, { name: 'hello' });

		expect(out).not.toContain('[id]');
		expect(out).toContain('[name]');
	});

	test('non-generated columns are included even when peers are excluded', () => {
		const docs = mssqlTable('docs', {
			id: int().identity(),
			value: nvarchar({ length: 'max' }).notNull(),
			value_idx: nvarchar({ length: 450 }).generatedAlwaysAs(
				sql`(CONVERT([nvarchar](450),[value]))`,
			),
		});

		const out = insertSql(docs, { value: 'hello' });

		// expected shape: `insert into [docs] ([value]) values (...)` — only the
		// one explicitly-set column shows in the column list.
		expect(out).toMatch(/insert into \[docs\] \(\[value\]\) values/);
	});
});
