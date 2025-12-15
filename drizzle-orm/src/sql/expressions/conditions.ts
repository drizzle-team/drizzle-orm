import { type AnyColumn, Column, type GetColumnData } from '~/column.ts';
import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import {
	isDriverValueEncoder,
	isSQLWrapper,
	Param,
	Placeholder,
	SQL,
	sql,
	type SQLChunk,
	type SQLWrapper,
	StringChunk,
	View,
} from '../sql.ts';

export function bindIfParam(value: unknown, column: SQLWrapper): SQLChunk {
	if (
		isDriverValueEncoder(column)
		&& !isSQLWrapper(value)
		&& !is(value, Param)
		&& !is(value, Placeholder)
		&& !is(value, Column)
		&& !is(value, Table)
		&& !is(value, View)
	) {
		return new Param(value, column);
	}
	return value as SQLChunk;
}

export interface BinaryOperator {
	<TColumn extends Column>(
		left: TColumn,
		right: GetColumnData<TColumn, 'raw'> | SQLWrapper,
	): SQL;
	<T>(left: SQL.Aliased<T>, right: T | SQLWrapper): SQL;
	<T extends SQLWrapper>(
		left: Exclude<T, SQL.Aliased | Column>,
		right: unknown,
	): SQL;
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
export const eq: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`${left} = ${bindIfParam(right, left)}`;
};

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
export const ne: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`${left} <> ${bindIfParam(right, left)}`;
};

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
export function and(...conditions: (SQLWrapper | undefined)[]): SQL | undefined;
export function and(
	...unfilteredConditions: (SQLWrapper | undefined)[]
): SQL | undefined {
	const conditions = unfilteredConditions.filter(
		(c): c is Exclude<typeof c, undefined> => c !== undefined,
	);

	if (conditions.length === 0) {
		return undefined;
	}

	if (conditions.length === 1) {
		return new SQL(conditions);
	}

	return new SQL([
		new StringChunk('('),
		sql.join(conditions, new StringChunk(' and ')),
		new StringChunk(')'),
	]);
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
export function or(...conditions: (SQLWrapper | undefined)[]): SQL | undefined;
export function or(
	...unfilteredConditions: (SQLWrapper | undefined)[]
): SQL | undefined {
	const conditions = unfilteredConditions.filter(
		(c): c is Exclude<typeof c, undefined> => c !== undefined,
	);

	if (conditions.length === 0) {
		return undefined;
	}

	if (conditions.length === 1) {
		return new SQL(conditions);
	}

	return new SQL([
		new StringChunk('('),
		sql.join(conditions, new StringChunk(' or ')),
		new StringChunk(')'),
	]);
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
export function not(condition: SQLWrapper): SQL {
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
export const gt: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`${left} > ${bindIfParam(right, left)}`;
};

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
export const gte: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`${left} >= ${bindIfParam(right, left)}`;
};

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
 * @see lte for less-than-or-equal
 */
export const lt: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`${left} < ${bindIfParam(right, left)}`;
};

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
export const lte: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`${left} <= ${bindIfParam(right, left)}`;
};

/**
 * Test whether the first parameter, a column or expression,
 * has a value from a list passed as the second argument.
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
	values: (T | Placeholder)[] | SQLWrapper,
): SQL;
export function inArray<TColumn extends Column>(
	column: TColumn,
	values: ReadonlyArray<GetColumnData<TColumn, 'raw'> | Placeholder> | SQLWrapper,
): SQL;
export function inArray<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: ReadonlyArray<unknown | Placeholder> | SQLWrapper,
): SQL;
export function inArray(
	column: SQLWrapper,
	values: ReadonlyArray<unknown | Placeholder> | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			return sql`false`;
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
	values: (T | Placeholder)[] | SQLWrapper,
): SQL;
export function notInArray<TColumn extends Column>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder)[] | SQLWrapper,
): SQL;
export function notInArray<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL;
export function notInArray(
	column: SQLWrapper,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			return sql`true`;
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
export function isNull(value: SQLWrapper): SQL {
	return sql`(${value} is null)`;
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
export function isNotNull(value: SQLWrapper): SQL {
	return sql`(${value} is not null)`;
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
	return sql`exists ${subquery}`;
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
	return sql`not exists ${subquery}`;
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
	min: T | SQLWrapper,
	max: T | SQLWrapper,
): SQL;
export function between<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'> | SQLWrapper,
	max: GetColumnData<TColumn, 'raw'> | SQLWrapper,
): SQL;
export function between<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	min: unknown,
	max: unknown,
): SQL;
export function between(column: SQLWrapper, min: unknown, max: unknown): SQL {
	return sql`${column} between ${bindIfParam(min, column)} and ${
		bindIfParam(
			max,
			column,
		)
	}`;
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
	min: T | SQLWrapper,
	max: T | SQLWrapper,
): SQL;
export function notBetween<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'> | SQLWrapper,
	max: GetColumnData<TColumn, 'raw'> | SQLWrapper,
): SQL;
export function notBetween<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	min: unknown,
	max: unknown,
): SQL;
export function notBetween(
	column: SQLWrapper,
	min: unknown,
	max: unknown,
): SQL {
	return sql`${column} not between ${
		bindIfParam(
			min,
			column,
		)
	} and ${bindIfParam(max, column)}`;
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
export function like(column: Column | SQL.Aliased | SQL | SQLWrapper, value: string | SQLWrapper): SQL {
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
export function notLike(column: Column | SQL.Aliased | SQL | SQLWrapper, value: string | SQLWrapper): SQL {
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
export function ilike(column: Column | SQL.Aliased | SQL | SQLWrapper, value: string | SQLWrapper): SQL {
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
export function notIlike(column: Column | SQL.Aliased | SQL | SQLWrapper, value: string | SQLWrapper): SQL {
	return sql`${column} not ilike ${value}`;
}

/**
 * Test that a column or expression contains all elements of
 * the list passed as the second argument.
 *
 * ## Throws
 *
 * The argument passed in the second array can't be empty:
 * if an empty is provided, this method will throw.
 *
 * ## Examples
 *
 * ```ts
 * // Select posts where its tags contain "Typescript" and "ORM".
 * db.select().from(posts)
 *   .where(arrayContains(posts.tags, ['Typescript', 'ORM']))
 * ```
 *
 * @see arrayContained to find if an array contains all elements of a column or expression
 * @see arrayOverlaps to find if a column or expression contains any elements of an array
 */
export function arrayContains<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder) | SQLWrapper,
): SQL;
export function arrayContains<TColumn extends Column>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder) | SQLWrapper,
): SQL;
export function arrayContains<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL;
export function arrayContains(
	column: SQLWrapper,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('arrayContains requires at least one value');
		}
		const array = sql`${bindIfParam(values, column)}`;
		return sql`${column} @> ${array}`;
	}

	return sql`${column} @> ${bindIfParam(values, column)}`;
}

/**
 * Test that the list passed as the second argument contains
 * all elements of a column or expression.
 *
 * ## Throws
 *
 * The argument passed in the second array can't be empty:
 * if an empty is provided, this method will throw.
 *
 * ## Examples
 *
 * ```ts
 * // Select posts where its tags contain "Typescript", "ORM" or both,
 * // but filtering posts that have additional tags.
 * db.select().from(posts)
 *   .where(arrayContained(posts.tags, ['Typescript', 'ORM']))
 * ```
 *
 * @see arrayContains to find if a column or expression contains all elements of an array
 * @see arrayOverlaps to find if a column or expression contains any elements of an array
 */
export function arrayContained<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder) | SQLWrapper,
): SQL;
export function arrayContained<TColumn extends Column>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder) | SQLWrapper,
): SQL;
export function arrayContained<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL;
export function arrayContained(
	column: SQLWrapper,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('arrayContained requires at least one value');
		}
		const array = sql`${bindIfParam(values, column)}`;
		return sql`${column} <@ ${array}`;
	}

	return sql`${column} <@ ${bindIfParam(values, column)}`;
}

/**
 * Test that a column or expression contains any elements of
 * the list passed as the second argument.
 *
 * ## Throws
 *
 * The argument passed in the second array can't be empty:
 * if an empty is provided, this method will throw.
 *
 * ## Examples
 *
 * ```ts
 * // Select posts where its tags contain "Typescript", "ORM" or both.
 * db.select().from(posts)
 *   .where(arrayOverlaps(posts.tags, ['Typescript', 'ORM']))
 * ```
 *
 * @see arrayContains to find if a column or expression contains all elements of an array
 * @see arrayContained to find if an array contains all elements of a column or expression
 */
export function arrayOverlaps<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder) | SQLWrapper,
): SQL;
export function arrayOverlaps<TColumn extends Column>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder) | SQLWrapper,
): SQL;
export function arrayOverlaps<T extends SQLWrapper>(
	column: Exclude<T, SQL.Aliased | Column>,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL;
export function arrayOverlaps(
	column: SQLWrapper,
	values: (unknown | Placeholder)[] | SQLWrapper,
): SQL {
	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('arrayOverlaps requires at least one value');
		}
		const array = sql`${bindIfParam(values, column)}`;
		return sql`${column} && ${array}`;
	}

	return sql`${column} && ${bindIfParam(values, column)}`;
}
