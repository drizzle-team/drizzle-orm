import { ColumnAliasProxyHandler, TableAliasProxyHandler } from './alias';
import { AnyColumn, Column } from './column';
import { SelectFields } from './operations';
import { SQL } from './sql';
import { Table } from './table';

export const SubqueryConfig = Symbol('SubqueryConfig');

export class Subquery<TSelection = unknown, TAlias extends string = string> {
	declare protected $brand: 'Subquery';
	declare protected $selection: TSelection;
	declare protected $alias: TAlias;

	/** @internal */
	[SubqueryConfig]: {
		sql: SQL;
		selection: SelectFields<AnyColumn, Table>;
		alias: string;
		isWith: boolean;
	};

	constructor(sql: SQL, selection: SelectFields<AnyColumn, Table>, alias: string, isWith: boolean = false) {
		this[SubqueryConfig] = {
			sql,
			selection,
			alias,
			isWith,
		};
	}
}

export type SubqueryWithSelection<TSelection, TAlias extends string> = Subquery<TSelection, TAlias> & TSelection;

export class WithSubquery<TSelection = unknown, TAlias extends string = string> extends Subquery<TSelection, TAlias> {
	declare protected $subqueryBrand: 'WithSubquery';
}

export type WithSubqueryWithSelection<TSelection, TAlias extends string> =
	& WithSubquery<TSelection, TAlias>
	& TSelection;

export type GetSubquerySelection<T extends Subquery> = T extends Subquery<infer TSelection> ? TSelection : never;
export type GetSubqueryAlias<T extends Subquery> = T extends Subquery<any, infer TAlias> ? TAlias : never;

export class SubquerySelectionProxyHandler<T extends Subquery | SelectFields<AnyColumn, Table>>
	implements ProxyHandler<Subquery | SelectFields<AnyColumn, Table>>
{
	constructor(private alias: string) {}

	get(subquery: T, prop: string | symbol, receiver: any): any {
		if (typeof prop === 'symbol') {
			return subquery[prop as keyof typeof subquery];
		}

		const columns = subquery instanceof Subquery ? subquery[SubqueryConfig].selection : subquery;
		const value: unknown = columns[prop as keyof typeof columns];

		if (value instanceof SQL.Aliased) {
			const newValue = value.clone();
			newValue.isSubquerySelectionField = true;
			return newValue;
		}

		if (value instanceof SQL) {
			throw new Error(
				`You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias. Please add an alias to the field using ".as('alias')" method.`,
			);
		}

		if (value instanceof Column) {
			return new Proxy(
				value,
				new ColumnAliasProxyHandler(new Proxy(value.table, new TableAliasProxyHandler(this.alias))),
			);
		}

		if (typeof value !== 'object' || value === null) {
			return value;
		}

		return new Proxy(value, new SubquerySelectionProxyHandler(this.alias));
	}
}
