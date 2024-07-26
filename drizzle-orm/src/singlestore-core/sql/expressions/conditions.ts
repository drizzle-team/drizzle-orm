import { sql, type SQL } from "~/sql/sql.ts";
import { bindIfParam } from "~/sql/expressions/conditions.ts";
import type { Table } from "~/table";

/**
 * Test that two values match.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made by Ford
 * db.select().from(cars)
 *   .where(match(cars.make, 'Ford'))
 * ```
 *
 * @see isNull for a way to test equality to NULL.
 */
export function match<
	TTable extends Table
>(left: TTable, right: unknown): SQL {
	return sql`MATCH (TABLE ${left}) AGAINST (${bindIfParam(right, left)})`;
}
