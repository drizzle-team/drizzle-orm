import { SQL, sql } from '~/sql/sql.ts';
import type { SurrealDBColumn } from './columns/common.ts';

export function concat(column: SurrealDBColumn | SQL, value: string): SQL {
	return sql`string::concat(${column}, ${value})`;
}

export function lower(column: SurrealDBColumn | SQL): SQL {
	return sql`string::lowercase(${column})`;
}

export function upper(column: SurrealDBColumn | SQL): SQL {
	return sql`string::uppercase(${column})`;
}

export function length(column: SurrealDBColumn | SQL): SQL<number> {
	return sql<number>`string::len(${column})`;
}
