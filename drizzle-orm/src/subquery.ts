import { ColumnAliasProxyHandler, TableAliasProxyHandler } from './alias';
import type { AnyColumn } from './column';
import { Column } from './column';
import type { SelectedFields } from './operations';
import { SQL } from './sql';
import type { Table } from './table';
import { View, ViewBaseConfig } from './view';

export const SubqueryConfig = Symbol('SubqueryConfig');

export class Subquery<TAlias extends string = string, TSelectedFields = unknown> {
	declare _: {
		brand: 'Subquery';
		selectedFields: TSelectedFields;
		alias: TAlias;
	};

	/** @internal */
	[SubqueryConfig]: {
		sql: SQL;
		selection: SelectedFields<AnyColumn, Table>;
		alias: string;
		isWith: boolean;
	};

	constructor(sql: SQL, selection: SelectedFields<AnyColumn, Table>, alias: string, isWith: boolean = false) {
		this[SubqueryConfig] = {
			sql,
			selection,
			alias,
			isWith,
		};
	}
}

export class WithSubquery<TAlias extends string = string, TSelection = unknown> extends Subquery<TAlias, TSelection> {}

export class SelectionProxyHandler<T extends Subquery | SelectedFields<AnyColumn, Table> | View>
	implements ProxyHandler<Subquery | SelectedFields<AnyColumn, Table> | View>
{
	private config: {
		/**
		 * Table alias for the columns
		 */
		alias?: string;
		/**
		 * What to do when a field is an instance of `SQL.Aliased` and it's not a selection field (from a subquery)
		 *
		 * `sql` - return the underlying SQL expression
		 *
		 * `alias` - return the field alias
		 */
		sqlAliasedBehavior: 'sql' | 'alias';
		/**
		 * What to do when a field is an instance of `SQL` and it doesn't have an alias declared
		 *
		 * `sql` - return the underlying SQL expression
		 *
		 * `error` - return a DrizzleTypeError on type level and throw an error on runtime
		 */
		sqlBehavior: 'sql' | 'error';
	};

	constructor(config: SelectionProxyHandler<T>['config']) {
		this.config = { ...config };
	}

	get(subquery: T, prop: string | symbol, receiver: any): any {
		if (typeof prop === 'symbol') {
			return subquery[prop as keyof typeof subquery];
		}

		const columns = subquery instanceof Subquery
			? subquery[SubqueryConfig].selection
			: subquery instanceof View
			? subquery[ViewBaseConfig].selectedFields
			: subquery;
		const value: unknown = columns[prop as keyof typeof columns];

		if (value instanceof SQL.Aliased) {
			// Never return the underlying SQL expression for a field previously selected in a subquery
			if (this.config.sqlAliasedBehavior === 'sql' && !value.isSelectionField) {
				return value.sql;
			}

			const newValue = value.clone();
			newValue.isSelectionField = true;
			return newValue;
		}

		if (value instanceof SQL) {
			if (this.config.sqlBehavior === 'sql') {
				return value;
			}

			throw new Error(
				`You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`,
			);
		}

		if (value instanceof Column) {
			if (this.config.alias) {
				return new Proxy(
					value,
					new ColumnAliasProxyHandler(new Proxy(value.table, new TableAliasProxyHandler(this.config.alias))),
				);
			}
			return value;
		}

		if (typeof value !== 'object' || value === null) {
			return value;
		}

		return new Proxy(value, new SelectionProxyHandler(this.config));
	}
}
