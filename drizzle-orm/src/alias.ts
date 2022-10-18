import { Column } from './column';
import { Table } from './table';
import { tableColumns, tableNameSym } from './utils';

export class ColumnAliasProxyHandler<TColumn extends Column> implements ProxyHandler<TColumn> {
	public constructor(private table: Table) {}

	public get(columnObj: TColumn, prop: string | symbol, receiver: any): any {
		if (prop === 'table') {
			return this.table;
		}
		return columnObj[prop as keyof TColumn];
	}
}

export class TableAliasProxyHandler implements ProxyHandler<Table> {
	public constructor(private alias: string) {}

	public get(tableObj: Table, prop: string | symbol, receiver: any): any {
		if (prop === tableNameSym) {
			return this.alias;
		}
		if (prop === tableColumns) {
			const proxiedColumns: { [key: string]: any } = {};
			Object.keys(tableObj[tableColumns]).map((key) => {
				proxiedColumns[key] = new Proxy(
					tableObj[tableColumns][key] as unknown as Column,
					new ColumnAliasProxyHandler(new Proxy(tableObj, this)),
				);
			});
			return proxiedColumns;
		}

		const value = tableObj[prop as keyof Table];
		if (value instanceof Column) {
			return new Proxy(value as Column, new ColumnAliasProxyHandler(new Proxy(tableObj, this)));
		}

		return value;
	}
}
