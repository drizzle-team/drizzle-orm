import type { Placeholder, SQL, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MySqlColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

export type ConcatValue = string | number | bigint | Placeholder | SQLWrapper;

export function concat(...values: [ConcatValue, ConcatValue, ...ConcatValue[]]): SQL {
	return sql`concat(${sql.join(values.map((value) => sql`${value}`), sql`, `)})`;
}

export function substring(
	column: MySqlColumn | SQL.Aliased,
	{ from, for: _for }: {
		from: number | bigint | Placeholder | SQLWrapper;
		for?: number | bigint | Placeholder | SQLWrapper;
	},
): SQL {
	return _for === undefined
		? sql`substring(${column} from ${from})`
		: sql`substring(${column} from ${from} for ${_for})`;
}
