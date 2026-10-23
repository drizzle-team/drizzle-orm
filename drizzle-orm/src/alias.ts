import type { View } from '~/view.ts';
import type * as V1 from './_relations.ts';
import { OriginalColumn } from './column-common.ts';
import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import { chunkKindOf, chunkKinds, isChunk, isSQLWrapper, type Name, SQL, sql } from './sql/sql.ts';
import type { Subquery } from './subquery.ts';
import { Qualifier, Table } from './table.ts';
import { ViewBaseConfig } from './view-common.ts';

export class ColumnTableAliasProxyHandler<TColumn extends Column> implements ProxyHandler<TColumn> {
	static readonly [entityKind]: string = 'ColumnTableAliasProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(private table: Table | View, private ignoreColumnAlias?: boolean) {}

	get(columnObj: TColumn, prop: string | symbol): any {
		if (prop === 'table') {
			return this.table;
		}

		if (prop === 'isAlias' && this.ignoreColumnAlias) {
			return false;
		}

		if (prop === OriginalColumn && !this.ignoreColumnAlias) {
			return () => columnObj;
		}

		return columnObj[prop as keyof TColumn];
	}
}

export class ViewSelectionAliasProxyHandler<TSelection extends Record<string, unknown>>
	implements ProxyHandler<TSelection>
{
	static readonly [entityKind]: string = 'ViewSelectionAliasProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(protected view: View, protected selection: TSelection, private ignoreColumnAlias?: boolean) {}

	private memo: WeakMap<object, any> | undefined;
	private columnHandler: ColumnTableAliasProxyHandler<Column> | undefined;

	get(selection: TSelection, prop: string | symbol): any {
		const value = selection[prop as keyof TSelection];
		if (typeof value !== 'object' || value === null) return value;

		const memo = this.memo ??= new WeakMap();
		let result = memo.get(value);
		if (result !== undefined) return result;

		if (isChunk(value, chunkKindOf(value), chunkKinds.column)) {
			result = new Proxy(
				value,
				this.columnHandler ??= new ColumnTableAliasProxyHandler(this.view, this.ignoreColumnAlias),
			);
		} else if (isSQLWrapper(value)) {
			result = value;
		} else {
			result = new Proxy(value as Record<string, unknown>, this);
		}

		memo.set(value, result);
		return result;
	}
}

export class TableAliasProxyHandler<T extends Table | View> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'TableAliasProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(private alias: string, private replaceOriginalName: boolean, private ignoreColumnAlias?: boolean) {}

	/** Alias as identifier, replaces `[Qualifier]` of tables */
	private qualifier: Name | undefined;
	/** Aliased columns by name, fast path for table columns */
	private proxiedColumns: Record<string, any> | undefined;
	/** For other props, columns & qualifier are hot paths and defined in their own variables due to performance benefits */
	private memo: WeakMap<object, any> | undefined;
	private columnHandler: ColumnTableAliasProxyHandler<Column> | undefined;

	get(target: T, prop: string | symbol, receiver: any): any {
		if (prop === Qualifier) {
			return this.qualifier ??= sql.identifier(this.alias);
		}

		if (prop === Table.Symbol.IsAlias) {
			return true;
		}

		if (prop === Table.Symbol.Name) {
			return this.alias;
		}

		if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) {
			return this.alias;
		}

		if (prop === Table.Symbol.Columns) {
			const columns = (target as Table)[Table.Symbol.Columns];
			if (!columns) return columns;

			return isChunk(target, chunkKindOf(target), chunkKinds.view)
				? this.aliasSelection(columns, receiver)
				: this.getProxiedColumns(columns, receiver);
		}

		if (prop === ViewBaseConfig) {
			const config = (<View> target)[ViewBaseConfig];
			const memo = this.memo ??= new WeakMap();
			let result = memo.get(config);
			if (result === undefined) {
				memo.set(
					config,
					result = {
						...config,
						name: this.alias,
						isAlias: true,
						selectedFields: this.aliasSelection(config.selectedFields, receiver),
					},
				);
			}

			return result;
		}

		const value = target[prop as keyof typeof target];
		if (isChunk(value, chunkKindOf(value), chunkKinds.column)) {
			const columns = (target as Table)[Table.Symbol.Columns];
			if (typeof prop === 'string' && columns?.[prop] === value) {
				return this.getProxiedColumns(columns, receiver)[prop];
			}

			const memo = this.memo ??= new WeakMap();
			let result = memo.get(value);
			if (result === undefined) memo.set(value, result = this.aliasColumn(value, receiver));

			return result;
		}

		return value;
	}

	private aliasColumn(column: AnyColumn, receiver: any): AnyColumn {
		return new Proxy(
			column,
			this.columnHandler ??= new ColumnTableAliasProxyHandler(receiver, this.ignoreColumnAlias),
		);
	}

	private aliasSelection(selection: Record<string, unknown>, receiver: any): Record<string, unknown> {
		const memo = this.memo ??= new WeakMap();
		let result = memo.get(selection);
		if (result === undefined) {
			memo.set(
				selection,
				result = new Proxy(selection, new ViewSelectionAliasProxyHandler(receiver, selection, this.ignoreColumnAlias)),
			);
		}

		return result;
	}

	private getProxiedColumns(columns: Record<string, AnyColumn>, receiver: any): Record<string, any> {
		if (this.proxiedColumns) return this.proxiedColumns;

		const proxiedColumns: Record<string, any> = {};
		for (const key of Object.keys(columns)) {
			proxiedColumns[key] = this.aliasColumn(columns[key]!, receiver);
		}

		return this.proxiedColumns = proxiedColumns;
	}
}

export class SubquerySelectionAliasProxyHandler<TSelection extends Record<string, unknown>>
	implements ProxyHandler<TSelection>
{
	static readonly [entityKind]: string = 'SubquerySelectionAliasProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(private subquery: Subquery, private alias: string) {}

	private memo: WeakMap<object, any> | undefined;
	private columnHandler: ColumnTableAliasProxyHandler<Column> | undefined;

	get(selection: TSelection, prop: string | symbol): any {
		const value = selection[prop as keyof TSelection];
		if (typeof value !== 'object' || value === null) return value;

		const memo = this.memo ??= new WeakMap();
		let result = memo.get(value);
		if (result !== undefined) return result;

		const kind = chunkKindOf(value);
		if (isChunk(value, kind, chunkKinds.column)) {
			result = new Proxy(value, this.columnHandler ??= new ColumnTableAliasProxyHandler(this.subquery as any, true));
		} else if (isChunk(value, kind, chunkKinds.aliased)) {
			result = value.clone();
			result.isSelectionField = true;
			result.origin = this.alias;
		} else {
			result = value;
		}

		memo.set(value, result);
		return result;
	}
}

export class SubqueryAliasProxyHandler<T extends Subquery> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'SubqueryAliasProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(private alias: string) {}

	/** Alias as identifier, replaces `[Qualifier]` of subqueries */
	private qualifier: Name | undefined;
	private config: T['_'] | undefined;
	private selection: Record<string, unknown> | undefined;

	get(target: T, prop: string | symbol, receiver: any): any {
		if (prop === Qualifier) {
			return this.qualifier ??= sql.identifier(this.alias);
		}

		if (prop === Table.Symbol.IsAlias) {
			return true;
		}

		if (prop === Table.Symbol.Name) {
			return this.alias;
		}

		if (prop === Table.Symbol.OriginalName) {
			return target._.alias;
		}

		if (prop === Table.Symbol.Schema) {
			return undefined;
		}

		if (prop === '_') {
			return this.config ??= {
				...target._,
				alias: this.alias,
				isWith: true,
				selectedFields: this.aliasSelection(target, receiver),
			};
		}

		if (prop === Table.Symbol.Columns) {
			return this.aliasSelection(target, receiver);
		}

		return target[prop as keyof T];
	}

	private aliasSelection(target: T, receiver: any): Record<string, unknown> {
		return this.selection ??= new Proxy(
			target._.selectedFields,
			new SubquerySelectionAliasProxyHandler(receiver, this.alias),
		);
	}
}

export class ColumnAliasProxyHandler<T extends Column> implements ProxyHandler<T> {
	static readonly [entityKind]: string = 'ColumnAliasProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(private alias: string) {}

	get(target: T, prop: string | symbol): any {
		if (prop === 'sourceTable') {
			return aliasedTable(target.sourceTable, this.alias);
		}

		return target[prop as keyof typeof target];
	}
}

/**
 * Does not apply type-level transformation
 *
 * For typed alias, use `import { alias } from 'drizzle-orm/dialect-core/alias'`
 */
export function aliasedTable<T extends Table | View | Subquery>(table: T, tableAlias: string): T {
	return isChunk(table, chunkKindOf(table), chunkKinds.subquery)
		? new Proxy(table, new SubqueryAliasProxyHandler(tableAlias)) as T
		: new Proxy(table, new TableAliasProxyHandler(tableAlias, false, false) as ProxyHandler<T>);
}

export function aliasedTableSQL(table: Table): SQL {
	const schema = table[Table.Symbol.Schema];
	const name = sql.identifier(table[Table.Symbol.OriginalName]);
	return schema ? sql`${sql.identifier(schema)}.${name} ${table}` : sql`${name} ${table}`;
}

export function aliasedColumn<T extends Column>(column: T, alias: string): T {
	return new Proxy(column, new ColumnAliasProxyHandler(alias));
}

export function aliasedRelation<T extends V1.Relation>(relation: T, tableAlias: string): T {
	return new Proxy(relation, new RelationTableAliasProxyHandler(tableAlias));
}

export function aliasedTableColumn<T extends AnyColumn>(column: T, tableAlias: string): T {
	return new Proxy(
		column,
		new ColumnTableAliasProxyHandler(
			new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false, false)),
			false,
		),
	);
}

export function mapColumnsInAliasedSQLToAlias(query: SQL.Aliased, alias: string): SQL.Aliased {
	return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}

export function mapColumnsInSQLToAlias(query: SQL, alias: string): SQL {
	return sql.join(query.queryChunks.map((c) => {
		const kind = chunkKindOf(c);
		if (isChunk(c, kind, chunkKinds.column)) {
			return aliasedTableColumn(c, alias);
		}
		if (isChunk(c, kind, chunkKinds.sql)) {
			return mapColumnsInSQLToAlias(c, alias);
		}
		if (isChunk(c, kind, chunkKinds.aliased)) {
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
