import { entityKind, is } from './entity.ts';
import type { SQL, SQLWrapper } from './sql/sql.ts';
import { sql } from './sql/sql.ts';
import type { View } from './sql/sql.ts';
import type { Subquery } from './subquery.ts';
import { Table } from './table.ts';

export class DefaultScope {
	static readonly [entityKind]: string = 'DefaultScope';

	constructor(public readonly scope: (table: any, context?: any) => SQLWrapper | undefined) {}
}

/**
 * Creates a default query filter (scope) for a table.
 *
 * @example
 * ```ts
 * export const users = pgTable('users', {
 *   id: serial('id').primaryKey(),
 *   deletedAt: timestamp('deleted_at'),
 * }, (table) => [
 *   defaultScope((table) => isNull(table.deletedAt)),
 * ]);
 * ```
 */
export function defaultScope<TTable extends Table = Table>(
	scope: (table: TTable, context?: any) => SQLWrapper | undefined,
): DefaultScope {
	return new DefaultScope(scope);
}

/**
 * Attaches a default query filter (scope) to an existing table instance.
 *
 * @example
 * ```ts
 * export const users = withDefaultScope(
 *   pgTable('users', {
 *     id: serial('id').primaryKey(),
 *     deletedAt: timestamp('deleted_at'),
 *   }),
 *   (table) => isNull(table.deletedAt)
 * );
 * ```
 */
export function withDefaultScope<T extends Table>(
	table: T,
	scope: (table: T, context?: any) => SQLWrapper | undefined,
): T {
	(table as any)[Table.Symbol.DefaultScope] = scope;
	return table;
}

/**
 * Resolves the default scope function associated with a table.
 */
export function getTableDefaultScope(
	table: Table,
): ((table: any, context?: any) => SQLWrapper | undefined) | undefined {
	if ((table as any)[Table.Symbol.DefaultScope]) {
		return (table as any)[Table.Symbol.DefaultScope];
	}

	const extraConfigBuilder = (table as any)[Table.Symbol.ExtraConfigBuilder];
	if (extraConfigBuilder !== undefined) {
		const extraColumns = (table as any)[Table.Symbol.ExtraConfigColumns] ?? (table as any)[Table.Symbol.Columns] ?? {};
		const extraConfig = extraConfigBuilder(extraColumns);
		const extraValues = Array.isArray(extraConfig) ? extraConfig.flat(1) : Object.values(extraConfig ?? {});
		for (const item of extraValues) {
			if (is(item, DefaultScope)) {
				(table as any)[Table.Symbol.DefaultScope] = item.scope;
				return item.scope;
			}
		}
	}

	return undefined;
}

/**
 * Evaluates and joins the default scope of a table with an existing where condition.
 */
export function applyDefaultScopeToWhere(
	table: SQL | Subquery | Table | View | undefined,
	where: SQL | undefined,
	context?: any,
): SQL | undefined {
	if (is(table, Table)) {
		const scopeFn = getTableDefaultScope(table);
		if (scopeFn) {
			const scopeCondition = scopeFn(table, context);
			if (scopeCondition) {
				return where ? sql`${scopeCondition} and (${where})` : sql`${scopeCondition}`;
			}
		}
	}
	return where;
}

export type ScopeJoinLike = {
	table: SQL | Subquery | Table | View;
	on?: SQL | undefined;
	joinType: string;
};

/**
 * Evaluates and appends default scopes of joined tables to their on conditions.
 */
export function applyDefaultScopeToJoins<T extends ScopeJoinLike>(
	joins: T[] | undefined,
	context?: any,
): T[] | undefined {
	if (!joins || joins.length === 0) {
		return joins;
	}

	return joins.map((join) => {
		if (is(join.table, Table)) {
			const scopeFn = getTableDefaultScope(join.table);
			if (scopeFn) {
				const scopeCondition = scopeFn(join.table, context);
				if (scopeCondition) {
					return {
						...join,
						on: join.on ? sql`${join.on} and ${scopeCondition}` : sql`${scopeCondition}`,
					};
				}
			}
		}
		return join;
	});
}
