import { AnyColumn } from '../../column';
import { SQL, sql, SQLWrapper } from '..';

export function asc(column: AnyColumn | SQLWrapper): SQL {
	return sql`${column} asc`;
}

export function desc(column: AnyColumn | SQLWrapper): SQL {
	return sql`${column} desc`;
}
