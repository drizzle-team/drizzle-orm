import { is, entityKind } from '~/entity.ts';
import { SQLiteColumn } from '../columns/index.ts';
import { type SQL, sql, type SQLWrapper, isSQLWrapper, SQLChunk } from '~/sql/index.ts';
import { SQLiteBuiltInFunction } from './common.ts';
import { type MaybeDistinct, getValueWithDistinct } from '~/distinct.ts';

export class SQLiteAggregateFunction<T = unknown> extends SQLiteBuiltInFunction<T> {
	static readonly [entityKind]: string = 'SQLiteAggregateFunction';

	filterWhere(where?: SQL | undefined): this {
		if (where) {
			this.sql.append(sql` filter (where ${where})`);
		}
		return this;
	}
}

/**
 * Returns the number of values in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // Number employees with null values
 * db.select({ value: count() }).from(employees)
 * // Number of employees where `name` is not null
 * db.select({ value: count(employees.name) }).from(employees)
 * // Number of employees where `name` is distinct (no duplicates)
 * db.select({ value: count(distinct(employees.name)) }).from(employees)
 * // Number of employees where their salaries are greater than $2,000 
 * db.select({ value: count().filterWhere(gt(employees.salary, 2000)) }).from(employees)
 * ```
 */
export function count(expression?: MaybeDistinct<SQLWrapper> | '*'): SQLiteAggregateFunction<number> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(isSQLWrapper(value) ? value : sql`*`);

	const sql_ = sql.join([sql`count(`, ...chunks, sql`)` ]).mapWith(Number);
	return new SQLiteAggregateFunction(sql_);
}

/**
 * Returns the average (arithmetic mean) of all non-null values in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // Average salary of an employee
 * db.select({ value: avg(employees.salary) }).from(employees)
 * // Average salary of an employee where `salary` is distinct (no duplicates)
 * db.select({ value: avg(distinct(employees.salary)) }).from(employees)
 * // Average salary of an employee where their salaries are greater than $2,000 
 * db.select({ value: avg(employees.salary).filterWhere(gt(employees.salary, 2000)) }).from(employees)
 * ```
 */
export function avg(expression: MaybeDistinct<SQLWrapper>): SQLiteAggregateFunction<number | null> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	const sql_ = sql.join([sql`avg(`, ...chunks, sql`)`]).mapWith(Number);
	return new SQLiteAggregateFunction(sql_);
}

/**
 * Returns the sum of all non-null values in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // Sum of every employee's salary
 * db.select({ value: sum(employees.salary) }).from(employees)
 * // Sum of every employee's salary where `salary` is distinct (no duplicates)
 * db.select({ value: sum(distinct(employees.salary)) }).from(employees)
 * // Sum of every employee's salary where their salaries are greater than $2,000 
 * db.select({ value: sum(employees.salary).filterWhere(gt(employees.salary, 2000)) }).from(employees)
 * ```
 * 
 * @see total for a function with the same purpose that's not part of the SQL standard and always returns a number
 */
export function sum(expression: MaybeDistinct<SQLWrapper>): SQLiteAggregateFunction<number | null> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	const sql_ = sql.join([sql`sum(`, ...chunks, sql`)`]).mapWith(Number);
	return new SQLiteAggregateFunction(sql_);
}

/**
 * Returns the sum of all non-null values in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // Sum of every employee's salary
 * db.select({ value: total(employees.salary) }).from(employees)
 * // Sum of every employee's salary where `salary` is distinct (no duplicates)
 * db.select({ value: total(distinct(employees.salary)) }).from(employees)
 * // Sum of every employee's salary where their salaries are greater than $2,000 
 * db.select({ value: total(employees.salary).filterWhere(gt(employees.salary, 2000)) }).from(employees)
 * ```
 * 
 * @see sum for a function with the same purpose that's part of the SQL standard and can return `null`
 */
export function total(expression: MaybeDistinct<SQLWrapper>): SQLiteAggregateFunction<number> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	const sql_ = sql.join([sql`total(`, ...chunks, sql`)`]).mapWith(Number);
	return new SQLiteAggregateFunction(sql_);
}

/**
 * Returns the maximum value in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // The employee with the highest salary
 * db.select({ value: max(employees.salary) }).from(employees)
 * ```
 */
export function max<T extends SQLWrapper>(expression: T): T extends SQLiteColumn
	? SQLiteAggregateFunction<T['_']['data'] | null>
	: SQLiteAggregateFunction<string | null>
{
	let sql_ = sql.join([sql`max(`, expression, sql`)`]);

	if (is(expression, SQLiteColumn)) {
		sql_ = sql_.mapWith(expression);
	} else {
		sql_ = sql_.mapWith(String);
	}

	return new SQLiteAggregateFunction(sql_) as any;
}

/**
 * Returns the minimum value in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // The employee with the lowest salary
 * db.select({ value: min(employees.salary) }).from(employees)
 * ```
 */
export function min<T extends SQLWrapper>(expression: T): T extends SQLiteColumn
	? SQLiteAggregateFunction<T['_']['data'] | null>
	: SQLiteAggregateFunction<string | null>
{
	let sql_ = sql.join([sql`min(`, expression, sql`)`]);

	if (is(expression, SQLiteColumn)) {
		sql_ = sql_.mapWith(expression);
	} else {
		sql_ = sql_.mapWith(String);
	}

	return new SQLiteAggregateFunction(sql_) as any;
}
