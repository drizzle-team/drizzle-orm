import { SQLiteColumn } from '../columns/index.ts';
import { AggregateFunction, count$, avg$, sum$, max$, min$ } from '~/sql/functions/index.ts';
import { type SQLWrapper, type SQLChunk, sql } from '~/sql/sql.ts';
import { getValueWithDistinct, type MaybeDistinct } from '~/distinct.ts';

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
export function count(expression?: MaybeDistinct<SQLWrapper> | '*'): AggregateFunction<number> {
  return count$('sqlite', expression);
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
export function avg(expression: MaybeDistinct<SQLWrapper>): AggregateFunction<string | null> {
	return avg$('sqlite', expression);
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
export function sum(expression: MaybeDistinct<SQLWrapper>): AggregateFunction<string | null> {
	return sum$('sqlite', expression);
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
export function total(expression: MaybeDistinct<SQLWrapper>): AggregateFunction<string> {
  const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	const fn = sql.join([sql`total(`, ...chunks, sql`)`]);
	return new AggregateFunction(fn).mapWith(String);
}

/**
 * Returns the maximum value in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // The employee with the highest salary
 * db.select({ value: max(employees.salary) }).from(employees)
 * // The employee with the highest salary but that's less than $2,000
 * db.select({ value: max(employees.salary).filterWhere(lt(employees.salary, 2000)) }).from(employees)
 * ```
 */
export function max<T extends SQLWrapper>(expression: T): T extends SQLiteColumn
	? AggregateFunction<T['_']['data'] | null>
	: AggregateFunction<string | null>
{
	return max$('sqlite', expression) as any;
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
	? AggregateFunction<T['_']['data'] | null>
	: AggregateFunction<string | null>
{
	return min$('sqlite', expression) as any;
}
