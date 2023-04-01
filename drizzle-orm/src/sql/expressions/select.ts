import type { AnyColumn } from '../../column';
import type { SQL, SQLWrapper } from '..';
import { sql } from '..';

export function asc(column: AnyColumn | SQLWrapper): SQL {
	return sql`${column} asc`;
}

export function desc(column: AnyColumn | SQLWrapper): SQL {
	return sql`${column} desc`;
}
