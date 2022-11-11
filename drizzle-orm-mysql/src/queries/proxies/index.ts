import { tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlTable } from '~/table';

export class ColumnProxyHandler<TColumn extends AnyMySqlColumn> implements ProxyHandler<TColumn> {
	constructor(private table: AnyMySqlTable) {}

	get(columnObj: TColumn, prop: string | symbol, receiver: any): any {
		if (prop === 'table') {
			return this.table;
		}
		return columnObj[prop as keyof TColumn];
	}
}

export class TableProxyHandler<TJoinedTable extends AnyMySqlTable> implements ProxyHandler<TJoinedTable> {
	constructor(private alias: string) {}

	get(tableObj: TJoinedTable, prop: string | symbol, receiver: any): any {
		if (prop === tableNameSym) {
			return this.alias;
		}
		if (prop === tableColumns) {
			const proxiedColumns: { [key: string]: any } = {};
			Object.keys(tableObj[tableColumns]).map((key) => {
				proxiedColumns[key] = new Proxy(
					tableObj[tableColumns][key] as unknown as AnyMySqlColumn,
					new ColumnProxyHandler(new Proxy(tableObj, this)),
				);
			});
			return proxiedColumns;
		}
		if (typeof prop !== 'string') {
			return tableObj[prop as keyof TJoinedTable];
		}
		return new Proxy(
			tableObj[prop as keyof TJoinedTable] as unknown as AnyMySqlColumn,
			new ColumnProxyHandler(new Proxy(tableObj, this)),
		);
	}
}
