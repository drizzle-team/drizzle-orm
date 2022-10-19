import { AnyColumn } from '../../column';
import { SQL, sql } from '..';

export function asc(column: AnyColumn): SQL {
	return sql`${column} asc`;
}

export function desc(column: AnyColumn): SQL {
	return sql`${column} desc`;
}
