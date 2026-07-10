import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import type { Relation } from './relations.ts';
import type { View } from './sql/sql.ts';
import { SQL, sql } from './sql/sql.ts';
import { Table } from './table.ts';
import { ViewBaseConfig } from './view-common.ts';

export class ColumnAliasProxyHandler<TColumn extends Column> implements ProxyHandler<TColumn> {
	static readonly [entityKind]: string = 'ColumnAliasProxyHandler';

	constructor(private table: Table | View) {}

	get(columnObj: TColumn, prop: string | symbol): any {
		if (prop === 'table') {
			return this.table;
		}

		return columnObj[prop as keyof TColumn];
	}
}

export class TableAliasProxyHandler<T extends Table | View> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'TableAliasProxyHandler';

	constructor(private alias: string, private replaceOriginalName: boolean) {}

	get(target: T, prop: string | symbol): any {
		if (prop === Table.Symbol.IsAlias) {
			return true;
		}

		if (prop === Table.Symbol.Name) {
			return this.alias;
		}

		if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) {
			return this.alias;
		}

		if (prop === ViewBaseConfig) {
			return {
				...target[ViewBaseConfig as keyof typeof target],
				name: this.alias,
				isAlias: true,
			};
		}

		if (prop === Table.Symbol.Columns) {
			const columns = (target as Table)[Table.Symbol.Columns];
			if (!columns) {
				return columns;
			}

			const proxiedColumns: { [key: string]: any } = {};

			Object.keys(columns).map((key) => {
				proxiedColumns[key] = new Proxy(
					columns[key]!,
					new ColumnAliasProxyHandler(new Proxy(target, this)),
				);
			});

			return proxiedColumns;
		}

		const value = target[prop as keyof typeof target];
		if (is(value, Column)) {
			return new Proxy(value as AnyColumn, new ColumnAliasProxyHandler(new Proxy(target, this)));
		}

		return value;
	}
}

export class RelationTableAliasProxyHandler<T extends Relation> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'RelationTableAliasProxyHandler';

	constructor(private alias: string) {}

	get(target: T, prop: string | symbol): any {
		if (prop === 'sourceTable') {
			return aliasedTable(target.sourceTable, this.alias);
		}

		return target[prop as keyof typeof target];
	}
}

export function aliasedTable<T extends Table | View>(
	table: T,
	tableAlias: string,
): T {
	return new Proxy(table, new TableAliasProxyHandler(tableAlias, false)) as any;
}

export function aliasedRelation<T extends Relation>(relation: T, tableAlias: string): T {
	return new Proxy(relation, new RelationTableAliasProxyHandler(tableAlias));
}

export function aliasedTableColumn<T extends AnyColumn>(column: T, tableAlias: string): T {
	return new Proxy(
		column,
		new ColumnAliasProxyHandler(new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false))),
	);
}

export function mapColumnsInAliasedSQLToAlias(query: SQL.Aliased, alias: string, table?: Table): SQL.Aliased {
	return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias, table), query.fieldAlias);
}

export function mapColumnsInSQLToAlias(query: SQL, alias: string, table?: Table): SQL {
	return sql.join(query.queryChunks.map((c) => {
		if (is(c, Column)) {
			// Only re-alias columns that belong to `table` (the table being aliased). When a
			// nested SQL embeds columns of *another* table — e.g. `$count(otherTable, <filter>)`
			// used as a relational-query `extras` value — those foreign columns must keep their
			// own table qualifier; re-aliasing them to `alias` produces a reference to a column
			// that doesn't exist on the aliased table. When `table` is omitted the historical
			// behaviour (re-alias every column) is preserved.
			if (table !== undefined && !columnBelongsToTable(c, table)) {
				return c;
			}
			return aliasedTableColumn(c, alias);
		}
		if (is(c, SQL)) {
			return mapColumnsInSQLToAlias(c, alias, table);
		}
		if (is(c, SQL.Aliased)) {
			return mapColumnsInAliasedSQLToAlias(c, alias, table);
		}
		return c;
	}));
}

function columnBelongsToTable(column: Column, table: Table): boolean {
	const columnTable = column.table;
	// If the column isn't attributable to a concrete table (e.g. it belongs to a view or
	// subquery selection), fall back to the historical behaviour of re-aliasing it.
	if (!is(columnTable, Table)) {
		return true;
	}
	return tableOriginalUniqueName(columnTable) === tableOriginalUniqueName(table);
}

// Identifies a table by its *original* (pre-alias) schema-qualified name, so that a column
// referenced through an alias proxy still matches the underlying table it was defined on.
function tableOriginalUniqueName(table: Table): string {
	return `${table[Table.Symbol.Schema] ?? 'public'}.${table[Table.Symbol.OriginalName]}`;
}
