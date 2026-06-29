import type { Column, GetColumnData } from '~/column.ts';
import { bindIfParam } from '~/sql/expressions/index.ts';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MsSqlColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

/**
 * Test whether the first parameter, a column or expression,
 * has a value from a list passed as the second argument.
 *
 * T-SQL has no `true`/`false` keywords, so an empty array
 * is rendered as the always-false predicate `1 = 0`.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made by Ford or GM.
 * db.select().from(cars)
 *   .where(inArray(cars.make, ['Ford', 'GM']))
 * ```
 *
 * @see notInArray for the inverse of this test
 */
export function inArray<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder)[] | SQLWrapper,
): SQL;
export function inArray<TColumn extends Column>(
	column: TColumn,
	values: ReadonlyArray<GetColumnData<TColumn, 'raw'> | Placeholder> | SQLWrapper,
): SQL;
export function inArray<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: ReadonlyArray<unknown | Placeholder> | SQLWrapper,
): SQL;
export function inArray(
	column: SQLWrapper,
	values: ReadonlyArray<unknown | Placeholder> | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			return sql`1 = 0`;
		}
		return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
	}

	return sql`${column} in ${bindIfParam(values, column)}`;
}

/**
 * Test whether the first parameter, a column or expression,
 * has a value that is not present in a list passed as the
 * second argument.
 *
 * T-SQL has no `true`/`false` keywords, so an empty array
 * is rendered as the always-true predicate `1 = 1`.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made by any company except Ford or GM.
 * db.select().from(cars)
 *   .where(notInArray(cars.make, ['Ford', 'GM']))
 * ```
 *
 * @see inArray for the inverse of this test
 */
export function notInArray<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder)[] | SQLWrapper,
): SQL;
export function notInArray<TColumn extends Column>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder)[] | SQLWrapper,
): SQL;
export function notInArray<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL;
export function notInArray(
	column: SQLWrapper,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			return sql`1 = 1`;
		}
		return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
	}

	return sql`${column} not in ${bindIfParam(values, column)}`;
}

// type ConcatValue = string | number | Placeholder | SQLWrapper;
//
// export function concat(...values: [ConcatValue, ConcatValue, ...ConcatValue[]]): SQL<string> {
// 	return sql.join(values.map((value) => sql`${value}`), sql`, `) as SQL<string>;
// }

export function concat(column: MsSqlColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} || ${bindIfParam(value, column)}`;
}

export function substring(
	column: MsSqlColumn | SQL.Aliased,
	{ from, for: _for }: { from?: number | Placeholder | SQLWrapper; for?: number | Placeholder | SQLWrapper },
): SQL {
	const chunks: SQLChunk[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, bindIfParam(from, column));
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, bindIfParam(_for, column));
	}
	chunks.push(sql`)`);
	return sql.join(chunks);
}
