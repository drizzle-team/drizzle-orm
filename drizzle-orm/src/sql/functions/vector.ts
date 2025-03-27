import type { AnyColumn } from '~/column.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { type SQL, sql, type SQLWrapper } from '../sql.ts';

function toSql(value: number[] | string[]): string {
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
export function l2Distance(
	column: SQLWrapper | AnyColumn,
	value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
	if (Array.isArray(value)) {
		return sql`${column} <-> ${toSql(value)}`;
	}
	return sql`${column} <-> ${value}`;
}

/**
 * L1 distance is one of the possible distance measures between two probability distribution vectors and it is
 * calculated as the sum of the absolute differences.
 * The smaller the distance between the observed probability vectors, the higher the accuracy of the synthetic data
 *
 * ## Examples
 *
 * ```ts
 * // Sort cars by embedding similarity
 * // to the given embedding
 * db.select().from(cars)
 *   .orderBy(l1Distance(cars.embedding, embedding));
 * ```
 *
 * ```ts
 * // Select distance of cars and embedding
 * // to the given embedding
 * db.select({distance: l1Distance(cars.embedding, embedding)}).from(cars)
 * ```
 */
export function l1Distance(
	column: SQLWrapper | AnyColumn,
	value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
	if (Array.isArray(value)) {
		return sql`${column} <+> ${toSql(value)}`;
	}
	return sql`${column} <+> ${value}`;
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
 *   .orderBy(innerProduct(cars.embedding, embedding));
 * ```
 *
 * ```ts
 * // Select distance of cars and embedding
 * // to the given embedding
 * db.select({ distance: innerProduct(cars.embedding, embedding) }).from(cars)
 * ```
 */
export function innerProduct(
	column: SQLWrapper | AnyColumn,
	value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
	if (Array.isArray(value)) {
		return sql`${column} <#> ${toSql(value)}`;
	}
	return sql`${column} <#> ${value}`;
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
	value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
	if (Array.isArray(value)) {
		return sql`${column} <=> ${toSql(value)}`;
	}
	return sql`${column} <=> ${value}`;
}

/**
 * Hamming distance between two strings or vectors of equal length is the number of positions at which the
 * corresponding symbols are different. In other words, it measures the minimum number of
 * substitutions required to change one string into the other, or equivalently,
 * the minimum number of errors that could have transformed one string into the other
 *
 * ## Examples
 *
 * ```ts
 * // Sort cars by embedding similarity
 * // to the given embedding
 * db.select().from(cars)
 *   .orderBy(hammingDistance(cars.embedding, embedding));
 * ```
 */
export function hammingDistance(
	column: SQLWrapper | AnyColumn,
	value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
	if (Array.isArray(value)) {
		return sql`${column} <~> ${toSql(value)}`;
	}
	return sql`${column} <~> ${value}`;
}

/**
 * ## Examples
 *
 * ```ts
 * // Sort cars by embedding similarity
 * // to the given embedding
 * db.select().from(cars)
 *   .orderBy(jaccardDistance(cars.embedding, embedding));
 * ```
 */
export function jaccardDistance(
	column: SQLWrapper | AnyColumn,
	value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
	if (Array.isArray(value)) {
		return sql`${column} <%> ${toSql(value)}`;
	}
	return sql`${column} <%> ${value}`;
}
