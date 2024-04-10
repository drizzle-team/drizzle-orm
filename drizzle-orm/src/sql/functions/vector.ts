import type { AnyColumn } from '~/index';
import { type SQL, sql, type SQLWrapper } from '../sql.ts';

function toSql(value: number[]): string {
	return JSON.stringify(value);
}

/**
 * Used in sorting and in querying, if used in sorting,
 * this specifies that the given column or expression should be sorted in an order
 * that minimizes the L2 distance to the given value.
 * If used in querying, this specifies that it should return the L2 distance
 * between the given column or expression and the given value.
 *
 * ## Examples
 *
 * ```ts
 * // Sort cars by embedding similarity
 * // to the given embedding
 * db.select().from(cars)
 *   .orderBy(l2Distance(cars.embedding, embedding));
 * ```
 *
 * ```ts
 * // Select distance of cars and embedding
 * // to the given embedding
 * db.select({distance: l2Distance(cars.embedding, embedding)}).from(cars)
 * ```
 */
export function l2Distance(column: SQLWrapper | AnyColumn, value: number[]): SQL {
	return sql`${column} <-> ${toSql(value)}`.mapWith(Number);
}

/**
 * Used in sorting and in querying, if used in sorting,
 * this specifies that the given column or expression should be sorted in an order
 * that minimizes the inner product distance to the given value.
 * If used in querying, this specifies that it should return the inner product distance
 * between the given column or expression and the given value.
 *
 * ## Examples
 *
 * ```ts
 * // Sort cars by embedding similarity
 * // to the given embedding
 * db.select().from(cars)
 *   .orderBy(maxInnerProduct(cars.embedding, embedding));
 * ```
 *
 * ```ts
 * // Select distance of cars and embedding
 * // to the given embedding
 * db.select({distance: maxInnerProduct(cars.embedding, embedding)}).from(cars)
 * ```
 */
export function maxInnerProduct(
	column: SQLWrapper | AnyColumn,
	value: number[],
): SQL {
	return sql`${column} <#> ${toSql(value)}`.mapWith(Number);
}

/**
 * Used in sorting and in querying, if used in sorting,
 * this specifies that the given column or expression should be sorted in an order
 * that minimizes the cosine distance to the given value.
 * If used in querying, this specifies that it should return the cosine distance
 * between the given column or expression and the given value.
 *
 * ## Examples
 *
 * ```ts
 * // Sort cars by embedding similarity
 * // to the given embedding
 * db.select().from(cars)
 *   .orderBy(cosineDistance(cars.embedding, embedding));
 * ```
 *
 * ```ts
 * // Select distance of cars and embedding
 * // to the given embedding
 * db.select({distance: cosineDistance(cars.embedding, embedding)}).from(cars)
 * ```
 */
export function cosineDistance(
	column: SQLWrapper | AnyColumn,
	value: number[],
): SQL {
	return sql`${column} <=> ${toSql(value)}`.mapWith(Number);
}
