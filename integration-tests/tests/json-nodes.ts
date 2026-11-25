import { type Column, getColumns, sql, type Table } from 'drizzle-orm';
import { expect } from 'vitest';

type RunQuery = (query: any) => Promise<any>;
const awaitQuery: RunQuery = (query) => query;

const chunks = <T>(items: T[], size: number): T[][] => {
	const result: T[][] = [];
	for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
	return result;
};

/**
 * Checks that rows selected through `sql.jsonObject` / `sql.jsonArray` match the `rows` selected directly.
 * Arrays are aggregated per row, grouped by `id` column, so each one holds its row's value only;
 * tables without `id` column are expected to hold a single row
 */
export async function assertJsonNodes<TRow extends Record<string, unknown>>(
	db: any,
	table: Table,
	rows: TRow[],
	{ run = awaitQuery, maxFields = Infinity, label, columns: keys }: {
		run?: RunQuery;
		/** Checks only these columns (and `id`) */
		columns?: string[];
		/** Splits columns into multiple objects, e.g. for pg's 100 arguments limit of `json_build_object` */
		maxFields?: number;
		label?: string;
	} = {},
) {
	const columns = Object.entries(getColumns(table) as Record<string, Column>).filter(([key]) =>
		!keys || key === 'id' || keys.includes(key)
	);
	// Tables without `id` are expected to hold a single row
	const id = Object.fromEntries(columns)['id'];
	if (!id) expect(rows).toHaveLength(1);
	const ordered = (query: any) => id ? query.orderBy(id) : query;
	const grouped = (query: any) => id ? query.groupBy(id).orderBy(id) : query;

	for (const part of chunks(columns, maxFields)) {
		const selection = Object.fromEntries(part);
		const expected = rows.map((row) => Object.fromEntries(part.map(([key]) => [key, row[key]])));

		expect(
			await run(
				ordered(
					db.select({
						object: sql.jsonObject(selection),
						nested: sql.jsonObject({ object: sql.jsonObject(selection) }),
					}).from(table),
				),
			),
			label,
		).toStrictEqual(expected.map((row) => ({ object: row, nested: { object: row } })));

		expect(
			await run(
				grouped(
					db.select({
						array: sql.jsonArray(sql.jsonObject(selection)),
						nested: sql.jsonObject({ array: sql.jsonArray(sql.jsonObject(selection)) }),
					}).from(table),
				),
			),
			label,
		).toStrictEqual(expected.map((row) => ({ array: [row], nested: { array: [row] } })));

		expect(
			await run(
				grouped(db.select(Object.fromEntries(part.map(([key, column]) => [key, sql.jsonArray(column)]))).from(table)),
			),
			label,
		).toStrictEqual(
			expected.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, [value]]))),
		);
	}
}
