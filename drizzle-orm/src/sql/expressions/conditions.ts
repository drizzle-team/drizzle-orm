import { type AnyColumn, Column, type GetColumnData } from '~/column';
import { Table } from '~/table';
import { View } from '~/view';
import {
	isDriverValueEncoder,
	isSQLWrapper,
	Param,
	Placeholder,
	type SQL,
	sql,
	type SQLChunk,
	type SQLWrapper,
} from '../index';

export function bindIfParam(value: unknown, column: AnyColumn | SQL.Aliased): SQLChunk {
	if (
		isDriverValueEncoder(column) && !isSQLWrapper(value) && !(value instanceof Param) && !(value instanceof Placeholder)
		&& !(value instanceof Column) && !(value instanceof Table) && !(value instanceof View)
	) {
		return new Param(value, column);
	}
	return value as SQLChunk;
}

/**
 * Test that two values are equal.
 *
 * Remember that the SQL standard dictates that
 * two NULL values are not equal, so if you want to test
 * whether a value is null, you may want to use
 * `isNull` instead.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made by Ford
 * db.select().from(cars)
 *   .where(eq(cars.make, 'Ford'))
 * ```
 *
 * @see isNull for a way to test equality to NULL.
 */
export function eq<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function eq<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function eq(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} = ${bindIfParam(right, left)}`;
}

/**
 * Test that two values are not equal.
 *
 * Remember that the SQL standard dictates that
 * two NULL values are not equal, so if you want to test
 * whether a value is not null, you may want to use
 * `isNotNull` instead.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars not made by Ford
 * db.select().from(cars)
 *   .where(ne(cars.make, 'Ford'))
 * ```
 *
 * @see isNotNull for a way to test whether a value is not null.
 */
export function ne<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function ne<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function ne(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} <> ${bindIfParam(right, left)}`;
}

/**
 * Combine a list of conditions with the `and` operator. Conditions
 * that are equal `undefined` are automatically ignored.
 *
 * ## Examples
 *
 * ```ts
 * db.select().from(cars)
 *   .where(
 *     and(
 *       eq(cars.make, 'Volvo'),
 *       eq(cars.year, 1950),
 *     )
 *   )
 * ```
 */
export function and(...conditions: (SQL | undefined)[]): SQL | undefined;
export function and(...unfilteredConditions: (SQL | undefined)[]): SQL | undefined {
	const conditions = unfilteredConditions.filter((c): c is Exclude<typeof c, undefined> => c !== undefined);

	if (conditions.length === 0) {
		return undefined;
	}

	if (conditions.length === 1) {
		return conditions[0];
	}

	const chunks: SQL[] = [sql.raw('(')];
	for (const [index, condition] of conditions.entries()) {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(sql` and `, condition);
		}
	}
	chunks.push(sql`)`);

	return sql.fromList(chunks);
}

/**
 * Combine a list of conditions with the `or` operator. Conditions
 * that are equal `undefined` are automatically ignored.
 *
 * ## Examples
 *
 * ```ts
 * db.select().from(cars)
 *   .where(
 *     or(
 *       eq(cars.make, 'GM'),
 *       eq(cars.make, 'Ford'),
 *     )
 *   )
 * ```
 */
export function or(...conditions: (SQL | undefined)[]): SQL | undefined;
export function or(...unfilteredConditions: (SQL | undefined)[]): SQL | undefined {
	const conditions = unfilteredConditions.filter((c): c is Exclude<typeof c, undefined> => c !== undefined);

	if (conditions.length === 0) {
		return undefined;
	}

	if (conditions.length === 1) {
		return conditions[0];
	}

	const chunks: SQL[] = [sql.raw('(')];
	for (const [index, condition] of conditions.entries()) {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(sql` or `, condition);
		}
	}
	chunks.push(sql`)`);

	return sql.fromList(chunks);
}

/**
 * Negate the meaning of an expression using the `not` keyword.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars _not_ made by GM or Ford.
 * db.select().from(cars)
 *   .where(not(inArray(cars.make, ['GM', 'Ford'])))
 * ```
 */
export function not(condition: SQL): SQL {
	return sql`not ${condition}`;
}

/**
 * Test that the first expression passed is greater than
 * the second expression.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made after 2000.
 * db.select().from(cars)
 *   .where(gt(cars.year, 2000))
 * ```
 *
 * @see gte for greater-than-or-equal
 */
export function gt<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gt<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gt(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} > ${bindIfParam(right, left)}`;
}

/**
 * Test that the first expression passed is greater than
 * or equal to the second expression. Use `gt` to
 * test whether an expression is strictly greater
 * than another.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made on or after 2000.
 * db.select().from(cars)
 *   .where(gte(cars.year, 2000))
 * ```
 *
 * @see gt for a strictly greater-than condition
 */
export function gte<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gte<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gte(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} >= ${bindIfParam(right, left)}`;
}

/**
 * Test that the first expression passed is less than
 * the second expression.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made before 2000.
 * db.select().from(cars)
 *   .where(lt(cars.year, 2000))
 * ```
 *
 * @see lte for greater-than-or-equal
 */
export function lt<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lt<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lt(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} < ${bindIfParam(right, left)}`;
}

/**
 * Test that the first expression passed is less than
 * or equal to the second expression.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made before 2000.
 * db.select().from(cars)
 *   .where(lte(cars.year, 2000))
 * ```
 *
 * @see lt for a strictly less-than condition
 */
export function lte<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lte<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lte(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} <= ${bindIfParam(right, left)}`;
}

/**
 * Test whether the first parameter, a column or expression,
 * has a value from a list passed as the second argument.
 *
 * ## Throws
 *
 * The argument passed in the second array can’t be empty:
 * if an empty is provided, this method will throw.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made by Ford or GM.
 * db.select().from(cars)
 *   .where(inArray(cars.make, ['Ford', 'GM']))
 * ```
 *
 * @see notInArray for the inverse of this test
 */
export function inArray<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function inArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function inArray(
	column: AnyColumn | SQL.Aliased,
	values: (unknown | Placeholder)[] | Placeholder | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('inArray requires at least one value');
		}
		return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
	}

	return sql`${column} in ${bindIfParam(values, column)}`;
}

/**
 * Test whether the first parameter, a column or expression,
 * has a value that is not present in a list passed as the
 * second argument.
 *
 * ## Throws
 *
 * The argument passed in the second array can’t be empty:
 * if an empty is provided, this method will throw.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made by any company except Ford or GM.
 * db.select().from(cars)
 *   .where(notInArray(cars.make, ['Ford', 'GM']))
 * ```
 *
 * @see inArray for the inverse of this test
 */
export function notInArray<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function notInArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function notInArray(
	column: AnyColumn | SQL.Aliased,
	values: (unknown | Placeholder)[] | Placeholder | SQLWrapper,
): SQL {
	if (isSQLWrapper(values)) {
		return sql`${column} not in ${values}`;
	}

	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('inArray requires at least one value');
		}
		return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
	}

	return sql`${column} not in ${bindIfParam(values, column)}`;
}

/**
 * Test whether an expression is NULL. By the SQL standard,
 * NULL is neither equal nor not equal to itself, so
 * it's recommended to use `isNull` and `notIsNull` for
 * comparisons to NULL.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars that have no discontinuedAt date.
 * db.select().from(cars)
 *   .where(isNull(cars.discontinuedAt))
 * ```
 *
 * @see isNotNull for the inverse of this test
 */
export function isNull(column: AnyColumn | Placeholder | SQLWrapper): SQL {
	return sql`${column} is null`;
}

/**
 * Test whether an expression is not NULL. By the SQL standard,
 * NULL is neither equal nor not equal to itself, so
 * it's recommended to use `isNull` and `notIsNull` for
 * comparisons to NULL.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars that have been discontinued.
 * db.select().from(cars)
 *   .where(isNotNull(cars.discontinuedAt))
 * ```
 *
 * @see isNull for the inverse of this test
 */
export function isNotNull(column: AnyColumn | Placeholder | SQLWrapper): SQL {
	return sql`${column} is not null`;
}

/**
 * Test whether a subquery evaluates to have any rows.
 *
 * ## Examples
 *
 * ```ts
 * // Users whose `homeCity` column has a match in a cities
 * // table.
 * db
 *   .select()
 *   .from(users)
 *   .where(
 *     exists(db.select()
 *       .from(cities)
 *       .where(eq(users.homeCity, cities.id))),
 *   );
 * ```
 *
 * @see notExists for the inverse of this test
 */
export function exists(subquery: SQLWrapper): SQL {
	return sql`exists (${subquery})`;
}

/**
 * Test whether a subquery doesn't include any result
 * rows.
 *
 * ## Examples
 *
 * ```ts
 * // Users whose `homeCity` column doesn't match
 * // a row in the cities table.
 * db
 *   .select()
 *   .from(users)
 *   .where(
 *     notExists(db.select()
 *       .from(cities)
 *       .where(eq(users.homeCity, cities.id))),
 *   );
 * ```
 *
 * @see exists for the inverse of this test
 */
export function notExists(subquery: SQLWrapper): SQL {
	return sql`not exists (${subquery})`;
}

/**
 * Test whether an expression is between two values. This
 * is an easier way to express range tests, which would be
 * expressed mathematically as `x <= a <= y` but in SQL
 * would have to be like `a >= x AND a <= y`.
 *
 * Between is inclusive of the endpoints: if `column`
 * is equal to `min` or `max`, it will be TRUE.
 *
 * ## Examples
 *
 * ```ts
 * // Select cars made between 1990 and 2000
 * db.select().from(cars)
 *   .where(between(cars.year, 1990, 2000))
 * ```
 *
 * @see notBetween for the inverse of this test
 */
export function between<T>(
	column: SQL.Aliased,
	min: T | Placeholder | SQLWrapper,
	max: T | Placeholder | SQLWrapper,
): SQL;
export function between<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
	max: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
): SQL;
export function between(
	column: AnyColumn | SQL.Aliased,
	min: unknown | Placeholder | SQLWrapper,
	max: unknown | Placeholder | SQLWrapper,
): SQL {
	return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(max, column)}`;
}

/**
 * Test whether an expression is not between two values.
 *
 * This, like `between`, includes its endpoints, so if
 * the `column` is equal to `min` or `max`, in this case
 * it will evaluate to FALSE.
 *
 * ## Examples
 *
 * ```ts
 * // Exclude cars made in the 1970s
 * db.select().from(cars)
 *   .where(notBetween(cars.year, 1970, 1979))
 * ```
 *
 * @see between for the inverse of this test
 */
export function notBetween<T>(
	column: SQL.Aliased,
	min: T | Placeholder | SQLWrapper,
	max: T | Placeholder | SQLWrapper,
): SQL;
export function notBetween<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
	max: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
): SQL;
export function notBetween(
	column: AnyColumn | SQL.Aliased,
	min: unknown | Placeholder | SQLWrapper,
	max: unknown | Placeholder | SQLWrapper,
): SQL {
	return sql`${column} not between ${bindIfParam(min, column)} and ${bindIfParam(max, column)}`;
}

/**
 * Compare a column to a pattern, which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * ## Examples
 *
 * ```ts
 * // Select all cars with 'Turbo' in their names.
 * db.select().from(cars)
 *   .where(like(cars.name, '%Turbo%'))
 * ```
 *
 * @see ilike for a case-insensitive version of this condition
 */
export function like(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} like ${value}`;
}

/**
 * The inverse of like - this tests that a given column
 * does not match a pattern, which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * ## Examples
 *
 * ```ts
 * // Select all cars that don't have "ROver" in their name.
 * db.select().from(cars)
 *   .where(notLike(cars.name, '%Rover%'))
 * ```
 *
 * @see like for the inverse condition
 * @see notIlike for a case-insensitive version of this condition
 */
export function notLike(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} not like ${value}`;
}

/**
 * Case-insensitively compare a column to a pattern,
 * which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * Unlike like, this performs a case-insensitive comparison.
 *
 * ## Examples
 *
 * ```ts
 * // Select all cars with 'Turbo' in their names.
 * db.select().from(cars)
 *   .where(ilike(cars.name, '%Turbo%'))
 * ```
 *
 * @see like for a case-sensitive version of this condition
 */
export function ilike(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} ilike ${value}`;
}

/**
 * The inverse of ilike - this case-insensitively tests that a given column
 * does not match a pattern, which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * ## Examples
 *
 * ```ts
 * // Select all cars that don't have "Rover" in their name.
 * db.select().from(cars)
 *   .where(notLike(cars.name, '%Rover%'))
 * ```
 *
 * @see ilike for the inverse condition
 * @see notLike for a case-sensitive version of this condition
 */
export function notIlike(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} not ilike ${value}`;
}
