import { sql, type SQL, type SQLWrapper } from "~/sql/sql.ts";
import { bindIfParam } from "~/sql/expressions/conditions.ts";
import type { BinaryOperator } from "~/sql/expressions";

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
export const match: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`MATCH ${left} AGAINST ${bindIfParam(right, left)}`;
};
