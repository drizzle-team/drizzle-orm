import { bindIfParam } from '~/sql/expressions/index.ts';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { SingleStoreColumn } from './columns/index.ts';

export * from '~/sql/expressions/index.ts';

export function concat(column: SingleStoreColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} || ${bindIfParam(value, column)}`;
}

export function substring(
	column: SingleStoreColumn | SQL.Aliased,
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

// Vectors
export function dotProduct(column: SingleStoreColumn | SQL.Aliased, value: Array<number>): SQL {
	return sql`${column} <*> ${JSON.stringify(value)}`;
}

export function euclideanDistance(column: SingleStoreColumn | SQL.Aliased, value: Array<number>): SQL {
	return sql`${column} <-> ${JSON.stringify(value)}`;
}
