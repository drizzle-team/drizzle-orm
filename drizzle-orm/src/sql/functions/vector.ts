import { AnyColumn } from "~/index";
import { SQLWrapper, sql } from "../sql.ts";

function toSql(value: number[]): string {
    return JSON.stringify(value);
}

export function l2Distance(column: SQLWrapper | AnyColumn, value: number[]) {
    return sql`${column} <-> ${toSql(value)}`;
}

export function maxInnerProduct(
    column: SQLWrapper | AnyColumn,
    value: number[]
) {
    return sql`${column} <#> ${toSql(value)}`;
}

export function cosineDistance(
    column: SQLWrapper | AnyColumn,
    value: number[]
) {
    return sql`${column} <=> ${toSql(value)}`;
}