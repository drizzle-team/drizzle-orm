import { MySqlColumn } from '../columns/index.ts';
import { count$, avg$, sum$, max$, min$ } from '~/sql/functions/index.ts';
import type { SQLWrapper, SQL } from '~/sql/sql.ts';
import type { MaybeDistinct } from '~/distinct.ts';

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
 * ```
 */
export function count(expression?: MaybeDistinct<SQLWrapper> | '*'): SQL<bigint> {
  return count$('mysql', expression);
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
 * ```
 */
export function avg(expression: MaybeDistinct<SQLWrapper>): SQL<string | null> {
	return avg$('mysql', expression);
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
 * ```
 */
export function sum(expression: MaybeDistinct<SQLWrapper>): SQL<string | null> {
	return sum$('mysql', expression);
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
export function max<T extends SQLWrapper>(expression: T): T extends MySqlColumn
	? SQL<T['_']['data'] | null>
	: SQL<string | null>
{
	return max$('mysql', expression) as any;
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
export function min<T extends SQLWrapper>(expression: T): T extends MySqlColumn
	? SQL<T['_']['data'] | null>
	: SQL<string | null>
{
	return min$('mysql', expression) as any;
}
