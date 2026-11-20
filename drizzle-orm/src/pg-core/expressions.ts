import type { PgColumn } from '~/pg-core/columns/index.ts';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';

export * from '~/sql/expressions/index.ts';

export function concat(column: PgColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} || ${value}`;
}

export type SubstringPosition = number | Placeholder | SQLWrapper;
export type SubstringPattern = string | Placeholder | SQLWrapper;

/** `substring(string from start for count)` */
export function substring(
	column: PgColumn | SQL.Aliased,
	options: { from: SubstringPosition; for?: SubstringPosition } | { from?: SubstringPosition; for: SubstringPosition },
): SQL;
/** `substring(string from pattern)` - POSIX regular expression */
export function substring(column: PgColumn | SQL.Aliased, options: { fromPattern: SubstringPattern }): SQL;
/** `substring(string similar pattern escape escape)` - SQL regular expression */
export function substring(
	column: PgColumn | SQL.Aliased,
	options: { similar: SubstringPattern; escape: SubstringPattern },
): SQL;
export function substring(
	column: PgColumn | SQL.Aliased,
	options: {
		from?: SubstringPosition;
		for?: SubstringPosition;
		fromPattern?: SubstringPattern;
		similar?: SubstringPattern;
		escape?: SubstringPattern;
	},
): SQL {
	if (options.similar !== undefined) {
		return sql`substring(${column} similar ${options.similar} escape ${options.escape})`;
	}
	if (options.fromPattern !== undefined) {
		return sql`substring(${column} from ${options.fromPattern})`;
	}

	// Untyped `from` param resolves to the `substring(text from pattern)` regex overload
	const chunks: SQLChunk[] = [sql`substring(`, column];
	if (options.from !== undefined) {
		chunks.push(sql` from (${options.from})::integer`);
	}
	// RDS sends values as longavlue, lack of cast points function to nonexistent `for bigint` overload
	if (options.for !== undefined) {
		chunks.push(sql` for (${options.for})::integer`);
	}
	chunks.push(sql`)`);
	return sql.join(chunks);
}
