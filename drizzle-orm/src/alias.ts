import type { AnyColumn} from './column';
import { Column } from './column';
import { Table } from './table';

export class ColumnAliasProxyHandler<TColumn extends AnyColumn> implements ProxyHandler<TColumn> {
	constructor(private table: Table) {}

	get(columnObj: TColumn, prop: string | symbol, receiver: any): any {
		if (prop === 'table') {
			return this.table;
		}
		return columnObj[prop as keyof TColumn];
	}
}

export class TableAliasProxyHandler implements ProxyHandler<Table> {
	constructor(private alias: string) {}

	get(tableObj: Table, prop: string | symbol, receiver: any): any {
		if (prop === Table.Symbol.Name) {
			return this.alias;
		}
		if (prop === Table.Symbol.Columns) {
			const columns = tableObj[Table.Symbol.Columns];
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

		const value = tableObj[prop as keyof Table];
		if (value instanceof Column) {
			return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(tableObj, this)));
		}

		return value;
	}
}
