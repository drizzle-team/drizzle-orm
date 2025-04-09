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

export function mapColumnsInAliasedSQLToAlias(query: SQL.Aliased, alias: string): SQL.Aliased {
	return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}

export function mapColumnsInSQLToAlias(query: SQL, alias: string): SQL {
	return sql.join(query.queryChunks.map((c) => {
		if (is(c, Column)) {
			return aliasedTableColumn(c, alias);
		}
		if (is(c, SQL)) {
			return mapColumnsInSQLToAlias(c, alias);
		}
		if (is(c, SQL.Aliased)) {
			return mapColumnsInAliasedSQLToAlias(c, alias);
		}
		return c;
	}));
}
