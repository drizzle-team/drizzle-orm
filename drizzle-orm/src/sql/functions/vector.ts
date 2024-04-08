import { AnyColumn } from "~/index";
import { SQL, SQLWrapper, sql } from "../sql.ts";

function toSql(value: number[]): string {
    return JSON.stringify(value);
}


/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in an order 
 * that is most similar to the given value in terms of L2 distance.
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
 */
export function l2Distance(column: SQLWrapper | AnyColumn, value: number[]): SQL {
    return sql`${column} <-> ${toSql(value)}`;
}


/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in an order 
 * that maximizes the inner product with the given value.
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
 */
export function maxInnerProduct(
    column: SQLWrapper | AnyColumn,
    value: number[]
): SQL {
    return sql`${column} <#> ${toSql(value)}`;
}

/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in an order 
 * that is most similar to the given value in terms of cosine distance.
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
 */
export function cosineDistance(
    column: SQLWrapper | AnyColumn,
    value: number[]
): SQL {
    return sql`${column} <=> ${toSql(value)}`;
}