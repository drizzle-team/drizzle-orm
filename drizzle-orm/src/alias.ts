import type * as V1 from './_relations.ts';
import { OriginalColumn } from './column-common.ts';
import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import type { View } from './sql/sql.ts';
import { SQL, sql } from './sql/sql.ts';
import { Table } from './table.ts';
import { ViewBaseConfig } from './view-common.ts';

/**
 * Creates an aliased table column by creating an object that inherits from the
 * original column's prototype chain but with an overridden `table` property.
 * This preserves the entityKind for proper `is()` checks while avoiding Proxy overhead.
 *
 * Performance: ~5.3x faster than Proxy-based approach in full cycle benchmarks.
 */
export function createAliasedTableColumn<TColumn extends Column>(
	column: TColumn,
	aliasedTable: Table | View,
	ignoreColumnAlias?: boolean,
): TColumn {
	// Create new object with the same prototype as the original column
	// This ensures is() checks work correctly (e.g., is(col, SQLiteColumn))
	const wrapper = Object.create(Object.getPrototypeOf(column)) as any;

	// Manually copy known Column properties for performance
	// This is ~80x faster than Object.getOwnPropertyDescriptors + defineProperties
	const col = column as any;
	wrapper.name = col.name;
	wrapper.keyAsName = col.keyAsName;
	wrapper.primary = col.primary;
	wrapper.notNull = col.notNull;
	wrapper.default = col.default;
	wrapper.defaultFn = col.defaultFn;
	wrapper.onUpdateFn = col.onUpdateFn;
	wrapper.hasDefault = col.hasDefault;
	wrapper.isUnique = col.isUnique;
	wrapper.uniqueName = col.uniqueName;
	wrapper.uniqueType = col.uniqueType;
	wrapper.dataType = col.dataType;
	wrapper.columnType = col.columnType;
	wrapper.enumValues = col.enumValues;
	wrapper.generated = col.generated;
	wrapper.generatedIdentity = col.generatedIdentity;
	wrapper.length = col.length;
	wrapper.isLengthExact = col.isLengthExact;
	wrapper.config = col.config;
	wrapper._ = col._;

	// Override the table property with the aliased table
	wrapper.table = aliasedTable;

	// Handle isAlias based on ignoreColumnAlias flag
	wrapper.isAlias = ignoreColumnAlias ? false : col.isAlias;

	// Override OriginalColumn to return the original column
	wrapper[OriginalColumn] = () => column[OriginalColumn]?.() ?? column;

	return wrapper as TColumn;
}

// Legacy Proxy-based handler - kept for backward compatibility with TableAliasProxyHandler
export class ColumnTableAliasProxyHandler<TColumn extends Column> implements ProxyHandler<TColumn> {
	static readonly [entityKind]: string = 'ColumnTableAliasProxyHandler';

	constructor(private table: Table | View, private ignoreColumnAlias?: boolean) {}

	get(columnObj: TColumn, prop: string | symbol): any {
		if (prop === 'table') {
			return this.table;
		}

		if (prop === 'isAlias' && this.ignoreColumnAlias) {
			return false;
		}

		return columnObj[prop as keyof TColumn];
	}
}

export class TableAliasProxyHandler<T extends Table | View> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'TableAliasProxyHandler';

	constructor(private alias: string, private replaceOriginalName: boolean, private ignoreColumnAlias?: boolean) {}

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
					new ColumnTableAliasProxyHandler(new Proxy(target, this), this.ignoreColumnAlias),
				);
			});

			return proxiedColumns;
		}

		const value = target[prop as keyof typeof target];
		if (is(value, Column)) {
			return new Proxy(
				value as AnyColumn,
				new ColumnTableAliasProxyHandler(new Proxy(target, this), this.ignoreColumnAlias),
			);
		}

		return value;
	}
}

export class ColumnAliasProxyHandler<T extends Column> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'ColumnAliasProxyHandler';

	constructor(private alias: string) {}

	get(target: T, prop: keyof Column): any {
		if (prop === 'isAlias') {
			return true;
		}

		if (prop === 'name') {
			return this.alias;
		}

		if (prop === 'keyAsName') {
			return false;
		}

		if (prop === OriginalColumn) {
			return () => target;
		}

		return target[prop];
	}
}

export class RelationTableAliasProxyHandler<T extends V1.Relation> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'RelationTableAliasProxyHandler';

	constructor(private alias: string) {}

	get(target: T, prop: string | symbol): any {
		if (prop === 'sourceTable') {
			return aliasedTable(target.sourceTable, this.alias);
		}

		return target[prop as keyof typeof target];
	}
}

export function aliasedTable<T extends Table | View>(table: T, tableAlias: string): T {
	return new Proxy(table, new TableAliasProxyHandler(tableAlias, false, false));
}

export function aliasedColumn<T extends Column>(column: T, alias: string): T {
	return new Proxy(column, new ColumnAliasProxyHandler(alias));
}

export function aliasedRelation<T extends V1.Relation>(relation: T, tableAlias: string): T {
	return new Proxy(relation, new RelationTableAliasProxyHandler(tableAlias));
}

export function aliasedTableColumn<T extends AnyColumn>(column: T, tableAlias: string): T {
	const aliasedTbl = new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false, false));
	return createAliasedTableColumn(column, aliasedTbl, false);
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

// Defined separately from the Column class to resolve circular dependency
Column.prototype.as = function(alias: string): Column {
	return aliasedColumn(this, alias);
};

export function getOriginalColumnFromAlias<T extends Column>(column: T): T {
	return column[OriginalColumn]();
}
