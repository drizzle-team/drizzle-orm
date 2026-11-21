import type { Placeholder, SQL, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MsSqlColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

export type ConcatValue = string | number | bigint | Placeholder | SQLWrapper;

export function concat(...values: [ConcatValue, ConcatValue, ...ConcatValue[]]): SQL {
	return sql`concat(${sql.join(values.map((value) => sql`${value}`), sql`, `)})`;
}

export function substring(
	column: MsSqlColumn | SQL.Aliased,
	start: number | Placeholder | SQLWrapper,
	length: number | Placeholder | SQLWrapper,
): SQL {
	return sql`substring(${column}, ${start}, ${length})`;
}
