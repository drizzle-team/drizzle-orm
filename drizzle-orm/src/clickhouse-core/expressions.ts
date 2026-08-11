import { bindIfParam } from '~/sql/expressions/index.ts';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { ClickHouseColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

/** `concat(a, b)` — ClickHouse's `||` is only defined for strings, so the function form is used. */
export function concat(column: ClickHouseColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`concat(${column}, ${bindIfParam(value, column)})`;
}

export function substring(
	column: ClickHouseColumn | SQL.Aliased,
	{ from, for: _for }: { from?: number | Placeholder | SQLWrapper; for?: number | Placeholder | SQLWrapper },
): SQL {
	const chunks: SQLChunk[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql`, `, bindIfParam(from, column));
	}
	if (_for !== undefined) {
		chunks.push(sql`, `, bindIfParam(_for, column));
	}
	chunks.push(sql`)`);
	return sql.join(chunks);
}

/** `has(arr, value)` — whether an `Array(T)` column contains a value. */
export function arrayContains(column: ClickHouseColumn | SQL.Aliased, value: unknown | SQLWrapper): SQL {
	return sql`has(${column}, ${value})`;
}

/** `length(arr)` — the number of elements in an `Array(T)` column. */
export function arrayLength(column: ClickHouseColumn | SQL.Aliased): SQL<number> {
	return sql<number>`length(${column})`;
}

/** `mapContains(map, key)` — whether a `Map(K, V)` column has the given key. */
export function mapContains(column: ClickHouseColumn | SQL.Aliased, key: unknown | SQLWrapper): SQL {
	return sql`mapContains(${column}, ${key})`;
}

/**
 * `<column> IN <subquery or values>` restricted to the current shard.
 *
 * ClickHouse's `GLOBAL IN` broadcasts the right-hand side to every shard; plain `IN` evaluates it
 * per shard. This is the explicit `GLOBAL` form for distributed queries.
 */
export function globalIn(column: ClickHouseColumn | SQL.Aliased, values: SQLWrapper): SQL {
	return sql`${column} global in ${values}`;
}
