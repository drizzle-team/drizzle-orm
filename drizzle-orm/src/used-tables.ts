import { is } from '~/entity.ts';
import { collectChunksUsedTables, type SQL } from '~/sql/sql.ts';
import { CacheKey, Table } from '~/table.ts';

/**
 * Collects cache keys of tables used for query's cache invalidation
 * `Table` contributes it's cache key, `SQL` - cache key of every table referenced within it
 */
export function usedTablesOf(source: Table | SQL): string[] {
	if (is(source, Table)) return [source[CacheKey]];
	const out = new Set<string>();
	collectChunksUsedTables(source.queryChunks, out);
	return [...out];
}
