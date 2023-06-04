import type { AnyColumn } from './column';
import { Column } from './column';
import type { Relation } from './relations';
import { SQL, sql } from './sql';
import { Table } from './table';
import { type View, ViewBaseConfig } from './view';

export class ColumnAliasProxyHandler<TColumn extends AnyColumn> implements ProxyHandler<TColumn> {
	constructor(private table: Table | View) {}

	get(columnObj: TColumn, prop: string | symbol): any {
		if (prop === 'table') {
			return this.table;
		}

		return columnObj[prop as keyof TColumn];
	}
}

export class TableAliasProxyHandler<T extends Table | View> implements ProxyHandler<T> {
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
		if (value instanceof Column) {
			return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(target, this)));
		}

		return value;
	}
}

export class RelationTableAliasProxyHandler<T extends Relation> implements ProxyHandler<T> {
	constructor(private alias: string) {}

	get(target: T, prop: string | symbol): any {
		if (prop === 'sourceTable') {
			return aliasedTable(target.sourceTable, this.alias);
		}

		return target[prop as keyof typeof target];
	}
}

export function aliasedTable<T extends Table>(table: T, tableAlias: string): T {
	return new Proxy(table, new TableAliasProxyHandler(tableAlias, false));
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

export function mapColumnsInAliasedSQLToAlias(query: SQL.Aliased, alias: string): SQL.Aliased {
	return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}

export function mapColumnsInSQLToAlias(query: SQL, alias: string): SQL {
	return sql.fromList(query.queryChunks.map((c) => {
		if (c instanceof Column) {
			return aliasedTableColumn(c, alias);
		}
		if (c instanceof SQL) {
			return mapColumnsInSQLToAlias(c, alias);
		}
		if (c instanceof SQL.Aliased) {
			return mapColumnsInAliasedSQLToAlias(c, alias);
		}
		return c;
	}));
}
