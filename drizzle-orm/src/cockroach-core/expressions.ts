import type { CockroachColumn } from '~/cockroach-core/columns/index.ts';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';

export * from '~/sql/expressions/index.ts';

export function concat(column: CockroachColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} || ${value}`;
}

export type SubstringPosition = number | bigint | Placeholder | SQLWrapper;
export type SubstringPattern = string | Placeholder | SQLWrapper;

/** `substring(string from start for count)` */
export function substring(
	column: CockroachColumn | SQL.Aliased,
	options: { from: SubstringPosition; for?: SubstringPosition } | { from?: SubstringPosition; for: SubstringPosition },
): SQL;
/** `substring(string from pattern)` - POSIX regular expression */
export function substring(column: CockroachColumn | SQL.Aliased, options: { fromPattern: SubstringPattern }): SQL;
/** `substring(input, regex, escape_char)` - POSIX regular expression with `escape_char` in place of `\\` */
export function substring(
	column: CockroachColumn | SQL.Aliased,
	options: { fromPattern: SubstringPattern; escape: SubstringPattern },
): SQL;
export function substring(
	column: CockroachColumn | SQL.Aliased,
	options: {
		from?: SubstringPosition;
		for?: SubstringPosition;
		fromPattern?: SubstringPattern;
		escape?: SubstringPattern;
	},
): SQL {
	if (options.fromPattern !== undefined) {
		return options.escape === undefined
			? sql`substring(${column} from ${options.fromPattern})`
			: sql`substring(${column}, ${options.fromPattern}, ${options.escape})`;
	}

	// Untyped `from` param resolves to the `substring(text from pattern)` regex overload
	const chunks: SQLChunk[] = [sql`substring(`, column];
	if (options.from !== undefined) {
		chunks.push(sql` from (${options.from})::int8`);
	}
	if (options.for !== undefined) {
		chunks.push(sql` for ${options.for}`);
	}
	chunks.push(sql`)`);
	return sql.join(chunks);
}
