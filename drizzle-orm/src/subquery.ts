import { ColumnAliasProxyHandler, TableAliasProxyHandler } from './alias.ts';
import { Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import { SQL, type SQLWrapper } from './sql/index.ts';
import { type ColumnsSelection, View, ViewBaseConfig } from './view.ts';

export const SubqueryConfig = Symbol.for('drizzle:SubqueryConfig');

export class Subquery<TAlias extends string = string, TSelectedFields = unknown> implements SQLWrapper {
	static readonly [entityKind]: string = 'Subquery';

	declare _: {
		brand: 'Subquery';
		selectedFields: TSelectedFields;
		alias: TAlias;
	};

	/** @internal */
	[SubqueryConfig]: {
		sql: SQL;
		selection: ColumnsSelection;
		alias: string;
		isWith: boolean;
	};

	constructor(sql: SQL, selection: Record<string, unknown>, alias: string, isWith = false) {
		this[SubqueryConfig] = {
			sql,
			selection,
			alias,
			isWith,
		};
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export class WithSubquery<TAlias extends string = string, TSelection = unknown> extends Subquery<TAlias, TSelection> {
	static readonly [entityKind]: string = 'WithSubquery';
}

export class SelectionProxyHandler<T extends Subquery | Record<string, unknown> | View>
	implements ProxyHandler<Subquery | Record<string, unknown> | View>
{
	static readonly [entityKind]: string = 'SelectionProxyHandler';

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

		/**
		 * Whether to replace the original name of the column with the alias
		 * Should be set to `true` for views creation
		 * @default false
		 */
		replaceOriginalName?: boolean;
	};

	constructor(config: SelectionProxyHandler<T>['config']) {
		this.config = { ...config };
	}

	get(subquery: T, prop: string | symbol): any {
		if (prop === SubqueryConfig) {
			return {
				...subquery[SubqueryConfig as keyof typeof subquery],
				selection: new Proxy(
					(subquery as Subquery)[SubqueryConfig].selection,
					this as ProxyHandler<Record<string, unknown>>,
				),
			};
		}

		if (prop === ViewBaseConfig) {
			return {
				...subquery[ViewBaseConfig as keyof typeof subquery],
				selectedFields: new Proxy(
					(subquery as View)[ViewBaseConfig].selectedFields,
					this as ProxyHandler<Record<string, unknown>>,
				),
			};
		}

		if (typeof prop === 'symbol') {
			return subquery[prop as keyof typeof subquery];
		}

		const columns = is(subquery, Subquery)
			? subquery[SubqueryConfig].selection
			: is(subquery, View)
			? subquery[ViewBaseConfig].selectedFields
			: subquery;
		const value: unknown = columns[prop as keyof typeof columns];

		if (is(value, SQL.Aliased)) {
			// Never return the underlying SQL expression for a field previously selected in a subquery
			if (this.config.sqlAliasedBehavior === 'sql' && !value.isSelectionField) {
				return value.sql;
			}

			const newValue = value.clone();
			newValue.isSelectionField = true;
			return newValue;
		}

		if (is(value, SQL)) {
			if (this.config.sqlBehavior === 'sql') {
				return value;
			}

			throw new Error(
				`You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`,
			);
		}

		if (is(value, Column)) {
			if (this.config.alias) {
				return new Proxy(
					value,
					new ColumnAliasProxyHandler(
						new Proxy(
							value.table,
							new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false),
						),
					),
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
