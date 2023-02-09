import { ColumnAliasProxyHandler, TableAliasProxyHandler } from './alias';
import { AnyColumn, Column } from './column';
import { SelectFields } from './operations';
import { SQL, SQLResponse } from './sql';
import { Table } from './table';

export const SubqueryConfig = Symbol('SubqueryConfig');
export const SubqueryOriginal = Symbol('SubqueryOriginal');

export class Subquery<TSelection = unknown, TAlias extends string = string> {
	declare protected $brand: 'Subquery';
	declare protected $selection: TSelection;
	declare protected $alias: TAlias;

	/** @internal */
	[SubqueryConfig]: {
		sql: SQL;
		selection: SelectFields<AnyColumn, Table>;
		alias: string;
	};

	/**	@internal */
	[SubqueryOriginal]: this;

	constructor(sql: SQL, selection: SelectFields<AnyColumn, Table>, alias: string) {
		this[SubqueryConfig] = {
			sql,
			selection,
			alias,
		};
		this[SubqueryOriginal] = this;
	}
}

export type SubqueryWithSelection<TSelection, TAlias extends string> = Subquery<TSelection, TAlias> & TSelection;

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

		if (value instanceof SQL || value instanceof SQLResponse) {
			return value;
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
