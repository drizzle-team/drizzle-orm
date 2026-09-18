import { bindIfParam } from '~/sql/expressions/index.ts';
import type { Placeholder, SQL, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MsSqlColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

// type ConcatValue = string | number | Placeholder | SQLWrapper;
//
// export function concat(...values: [ConcatValue, ConcatValue, ...ConcatValue[]]): SQL<string> {
// 	return sql.join(values.map((value) => sql`${value}`), sql`, `) as SQL<string>;
// }

export function concat(column: MsSqlColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	// `||` is not an operator in T-SQL. SQL Server concatenates with `+` or with concat(),
	// and concat() is the one that does not need the operands cast to a string type first.
	return sql`concat(${column}, ${bindIfParam(value, column)})`;
}

export function substring(
	column: MsSqlColumn | SQL.Aliased,
	{ from, for: _for }: { from?: number | Placeholder | SQLWrapper; for?: number | Placeholder | SQLWrapper },
): SQL {
	// T-SQL has no `substring(x from y for z)` form, only `substring(x, start, length)`,
	// and all three arguments are required. `substring` counts from 1, which is what an
	// omitted `from` means, and a length of `len(x)` runs to the end of the string.
	const start = from === undefined ? sql`1` : bindIfParam(from, column);
	const length = _for === undefined ? sql`len(${column})` : bindIfParam(_for, column);
	return sql`substring(${column}, ${start}, ${length})`;
}
