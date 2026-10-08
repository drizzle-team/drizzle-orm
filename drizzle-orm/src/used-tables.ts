import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { CacheKey, Table } from '~/table.ts';
import type { View } from '~/view.ts';

export type UsedTableSource = Table | Subquery | SQL | View | undefined;

/**
 * Adds the tables a source reads/writes into `out`, recursing through subqueries and raw SQL —
 * this is what feeds the query cache's invalidation index.
 *
 * A sink, not a producer: it writes straight into the caller's Set, so the per-table / per-join
 * / per-subquery path allocates nothing (no `[id]` arrays, no intermediate collections). A
 * `Table` contributes its precomputed `CacheKey`; a `Subquery` or `SQL` contributes the tables
 * it already collected. A `View` contributes nothing (matching the previous behaviour).
 */
export function collectUsedTables(source: UsedTableSource, out: Set<string>): void {
	if (source === undefined) return;
	if (is(source, Table)) {
		out.add(source[CacheKey]);
	} else if (is(source, Subquery)) {
		const tables = source._.usedTables;
		if (tables) { for (const t of tables) out.add(t); }
	} else if (is(source, SQL)) {
		const tables = source.usedTables;
		if (tables) { for (const t of tables) out.add(t); }
	}
}

/**
 * Array form for the few sites that need `string[]` (mutations, subquery materialisation). The
 * common single-`Table` case returns `[cacheKey]` directly — no Set, no concat; anything else
 * dedups through {@link collectUsedTables}.
 */
export function usedTablesOf(source: UsedTableSource): string[] {
	if (is(source, Table)) return [source[CacheKey]];
	const out = new Set<string>();
	collectUsedTables(source, out);
	return [...out];
}
