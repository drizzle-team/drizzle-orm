import type { AnyColumn } from '../../column.ts';
import type { SQL, SQLWrapper } from '../sql.ts';
import { sql } from '../sql.ts';

/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in ascending
 * order. By the SQL standard, ascending order is the
 * default, so it is not usually necessary to specify
 * ascending sort order.
 *
 * ## Examples
 *
 * ```ts
 * // Return cars, starting with the oldest models
 * // and going in ascending order to the newest.
 * db.select().from(cars)
 *   .orderBy(asc(cars.year));
 * ```
 *
 * @see desc to sort in descending order
 */
export function asc(column: AnyColumn | SQLWrapper): SQL {
	return sql`${column} asc`;
}

/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in descending
 * order.
 *
 * ## Examples
 *
 * ```ts
 * // Select users, with the most recently created
 * // records coming first.
 * db.select().from(users)
 *   .orderBy(desc(users.createdAt));
 * ```
 *
 * @see asc to sort in ascending order
 */
export function desc(column: AnyColumn | SQLWrapper): SQL {
	return sql`${column} desc`;
}
