import { is, entityKind } from '~/entity.ts';
import { PgColumn } from '../columns/index.ts';
import { type SQL, sql, type SQLWrapper, isSQLWrapper, SQLChunk } from '~/sql/index.ts';
import { PgBuiltInFunction } from './common.ts';
import { type MaybeDistinct, getValueWithDistinct } from '~/distinct.ts';

export class PgAggregateFunction<T = unknown> extends PgBuiltInFunction<T> {
	static readonly [entityKind]: string = 'PgAggregateFunction';

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
export function count<T extends 'number' | 'bigint' | undefined = undefined>(expression?: MaybeDistinct<SQLWrapper> | '*', config?: {
	mode: T;
}): PgAggregateFunction<T extends 'number' ? number : bigint> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(isSQLWrapper(value) ? value : sql`*`);

	const sql_ = sql
		.join([sql`count(`, ...chunks, sql`)` ])
		.mapWith(config?.mode === 'number' ? Number : BigInt);

	return new PgAggregateFunction(sql_) as any;
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
export function avg<T extends 'number' | 'bigint' | 'string' | undefined = undefined>(expression: MaybeDistinct<SQLWrapper>, config?: {
	mode: T;
}): PgAggregateFunction<(T extends 'bigint' ? bigint : T extends 'number' ? number : string) | null> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	let sql_ = sql.join([sql`avg(`, ...chunks, sql`)`]);

	if (config?.mode === 'bigint') {
		sql_ = sql_.mapWith(BigInt);
	} else if (config?.mode === 'number') {
		sql_ = sql_.mapWith(Number);
	}

	return new PgAggregateFunction(sql_) as any;
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
export function sum<T extends 'number' | 'bigint' | 'string' | undefined = undefined>(expression: MaybeDistinct<SQLWrapper>, config?: {
	mode: T;
}): PgAggregateFunction<(T extends 'bigint' ? bigint : T extends 'number' ? number : string) | null> {
	const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	let sql_ = sql.join([sql`sum(`, ...chunks, sql`)`]);

	if (config?.mode === 'bigint') {
		sql_ = sql_.mapWith(BigInt);
	} else if (config?.mode === 'number') {
		sql_ = sql_.mapWith(Number);
	}

	return new PgAggregateFunction(sql_) as any;
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
export function max<T extends SQLWrapper>(expression: T): T extends PgColumn
	? PgAggregateFunction<T['_']['data'] | null>
	: PgAggregateFunction<string | null>
{
	let sql_ = sql.join([sql`max(`, expression, sql`)`]);

	if (is(expression, PgColumn)) {
		sql_ = sql_.mapWith(expression);
	} else {
		sql_ = sql_.mapWith(String);
	}

	return new PgAggregateFunction(sql_) as any;
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
export function min<T extends SQLWrapper>(expression: T): T extends PgColumn
	? PgAggregateFunction<T['_']['data'] | null>
	: PgAggregateFunction<string | null>
{
	let sql_ = sql.join([sql`min(`, expression, sql`)`]);

	if (is(expression, PgColumn)) {
		sql_ = sql_.mapWith(expression);
	} else {
		sql_ = sql_.mapWith(String);
	}

	return new PgAggregateFunction(sql_) as any;
}
