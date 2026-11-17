import type { View } from '~/view.ts';
import { ColumnTableAliasProxyHandler, TableAliasProxyHandler } from './alias.ts';
import { entityKind, is } from './entity.ts';
import { chunkKindOf, chunkKinds, isChunk } from './sql/sql.ts';
import type { Subquery } from './subquery.ts';
import { ViewBaseConfig } from './view-common.ts';

export class SelectionProxyHandler<T extends Subquery | Record<string, unknown> | View>
	implements ProxyHandler<Subquery | Record<string, unknown> | View>
{
	static readonly [entityKind]: string = 'SelectionProxyHandler';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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

	get(subquery: T, prop: string | symbol, receiver: any): any {
		if (prop === '_') {
			return {
				...subquery['_' as keyof typeof subquery],
				selectedFields: new Proxy(
					(subquery as Subquery)._.selectedFields,
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

		const sourceKind = chunkKindOf(subquery);
		const columns = isChunk(subquery, sourceKind, chunkKinds.subquery)
			? subquery._.selectedFields
			: isChunk(subquery, sourceKind, chunkKinds.view)
			? subquery[ViewBaseConfig].selectedFields
			: subquery;
		const value: unknown = columns[prop as keyof typeof columns];

		// value === undefined check must stay for actual selection fields named `getSQL`
		if (value === undefined && prop === 'getSQL') {
			const target = subquery[prop as keyof T];
			if (typeof target !== 'function') return target;

			return target.bind(receiver ?? subquery);
		}

		const valueKind = chunkKindOf(value);
		if (isChunk(value, valueKind, chunkKinds.aliased)) {
			// Never return the underlying SQL expression for a field previously selected in a subquery
			if (this.config.sqlAliasedBehavior === 'sql' && !value.isSelectionField) {
				return value.sql;
			}

			const newValue = value.clone();
			newValue.isSelectionField = true;
			newValue.origin = this.config.alias;
			return newValue;
		}

		if (isChunk(value, valueKind, chunkKinds.sql)) {
			if (this.config.sqlBehavior === 'sql') {
				return value;
			}

			throw new Error(
				`You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`,
			);
		}

		if (isChunk(value, valueKind, chunkKinds.column)) {
			if (this.config.alias) {
				return new Proxy(
					value,
					new ColumnTableAliasProxyHandler(
						new Proxy(
							value.table,
							new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false, true),
						),
						true,
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
