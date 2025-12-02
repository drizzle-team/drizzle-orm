import { bindIfParam } from '~/sql/expressions/index.ts';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MsSqlColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

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
