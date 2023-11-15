import { PgColumn } from '../columns/index.ts';
import { type AggregateFunction, count$, avg$, sum$, max$, min$ } from '~/sql/functions/index.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
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
 * // Number of employees where their salaries are greater than $2,000 
 * db.select({ value: count().filterWhere(gt(employees.salary, 2000)) }).from(employees)
 * ```
 */
export function count(expression?: MaybeDistinct<SQLWrapper> | '*'): AggregateFunction<bigint> {
  return count$('pg', expression);
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
	return avg$('pg', expression);
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
 */
export function sum(expression: MaybeDistinct<SQLWrapper>): AggregateFunction<string | null> {
	return sum$('pg', expression);
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
export function max<T extends SQLWrapper>(expression: T): T extends PgColumn
	? AggregateFunction<T['_']['data'] | null>
	: AggregateFunction<string | null>
{
	return max$('pg', expression) as any;
}

/**
 * Returns the minimum value in `expression`.
 *
 * ## Examples
 *
 * ```ts
 * // The employee with the lowest salary
 * db.select({ value: min(employees.salary) }).from(employees)
 * // The employee with the lowest salary but that's greater than $1,000
 * db.select({ value: min(employees.salary).filterWhere(gt(employees.salary, 1000)) }).from(employees)
 * ```
 */
export function min<T extends SQLWrapper>(expression: T): T extends PgColumn
	? AggregateFunction<T['_']['data'] | null>
	: AggregateFunction<string | null>
{
	return min$('pg', expression) as any;
}
