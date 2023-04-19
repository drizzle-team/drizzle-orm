import type { AnyColumn } from './column';
import { Column } from './column';
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

	get(tableObj: T, prop: string | symbol): any {
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
				...tableObj[ViewBaseConfig as keyof typeof tableObj],
				name: this.alias,
				isAlias: true,
			};
		}

		if (prop === Table.Symbol.Columns) {
			const columns = (tableObj as Table)[Table.Symbol.Columns];
			if (!columns) {
				return columns;
			}

			const proxiedColumns: { [key: string]: any } = {};

			Object.keys(columns).map((key) => {
				proxiedColumns[key] = new Proxy(
					columns[key]!,
					new ColumnAliasProxyHandler(new Proxy(tableObj, this)),
				);
			});

			return proxiedColumns;
		}

		const value = tableObj[prop as keyof typeof tableObj];
		if (value instanceof Column) {
			return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(tableObj, this)));
		}

		return value;
	}
}
