import { SQL, sql } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableName, tableRowMapper } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from '~/columns/common';
import { AnyPgDialect, PgSession } from '~/connection';
import { PartialSelectResult, PgSelectFields, PgSelectFieldsOrdered } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType, PgTable, TableColumns } from '~/table';

import { TableProxyHandler } from './proxies';
import { AppendToReturn, BuildAlias, IncrementAlias, TableAlias } from './types';

export interface PgSelectConfig {
	fields: PgSelectFieldsOrdered;
	where?: AnyPgSQL;
	table: AnyPgTable;
	limit?: number;
	offset?: number;
	distinct?: AnyPgColumn;
	joins: { [k: string]: JoinsValue };
	orderBy: AnyPgSQL[];
}

export type JoinType = 'inner' | 'left' | 'right' | 'full';

interface JoinsValue {
	on: AnyPgSQL;
	table: AnyPgTable;
	joinType: JoinType;
	alias: AnyPgTable;
}

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelect extends
		| InferType<TTable>
		| PartialSelectResult<TableName<TTable>, PgSelectFields<TableName<TTable>>>,
> = TReturn extends undefined ? TInitialSelect[]
	: Simplify<TReturn & { [k in TableName<TTable>]: TInitialSelect }>[];

type AnyPgSelect = PgSelect<AnyPgTable, InferType<AnyPgTable>, any, any, any>;

export type PickJoin<TJoinReturn extends AnyPgSelect> = Omit<TJoinReturn, 'distinct'>;
export type PickWhere<TJoinReturn extends AnyPgSelect> = Omit<
	TJoinReturn,
	'distinct' | 'where' | 'innerJoin' | 'rightJoin' | 'leftJoin' | 'fullJoin'
>;
export type PickDistinct<TJoinReturn extends AnyPgSelect> = Omit<TJoinReturn, 'distinct'>;
export type PickOrderBy<TJoinReturn extends AnyPgSelect> = Pick<
	TJoinReturn,
	'limit' | 'offset' | 'execute'
>;
export type PickLimit<TJoinReturn extends AnyPgSelect> = Pick<TJoinReturn, 'offset' | 'execute'>;
export type PickOffset<TJoinReturn extends AnyPgSelect> = Pick<TJoinReturn, 'execute'>;

export class PgSelect<
	TTable extends AnyPgTable,
	TInitialSelect extends
		| InferType<TTable>
		| PartialSelectResult<TableName<TTable>, PgSelectFields<TableName<TTable>>>,
	TReturn = undefined,
	TJoins extends { [k: string]: any } = {},
	TAlias extends { [name: string]: number } = { [K in TableName<TTable>]: 1 },
> {
	protected enforceCovariance!: {
		table: TTable;
		initialSelect: TInitialSelect;
		return: TReturn;
		joins: TJoins;
		alias: TAlias;
	};

	private config: PgSelectConfig;
	private _alias!: TAlias;
	private _joins: TJoins = {} as TJoins;

	constructor(
		private table: PgSelectConfig['table'],
		private fields: PgSelectConfig['fields'],
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
		this._alias = { [table[tableName]]: 1 } as TAlias;
	}

	private join<
		TJoinedTable extends PgTable<TableName<TJoinedTable>, any>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				}
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		joinType: JoinType,
		partialCallback?: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	) {
		const originalName = value[tableName];
		let aliasIndex = this._alias[originalName];
		if (typeof aliasIndex === 'undefined') {
			this._alias[originalName] = aliasIndex = 1 as TAlias[TableName<TJoinedTable>];
		}

		const alias = `${originalName}${aliasIndex}`;
		this._alias[originalName]++;

		const tableAliasProxy = new Proxy(value, new TableProxyHandler(alias));

		Object.assign(this._joins, { [alias]: tableAliasProxy });

		const onExpression = callback(this._joins as any);

		const partialFields = partialCallback?.(
			tableAliasProxy as TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		);

		this.fields.push(...this.dialect.orderSelectedFields(partialFields ?? tableAliasProxy[tableColumns]));

		this.config.joins[alias] = {
			on: onExpression,
			table: value,
			joinType,
			alias: tableAliasProxy,
		};

		return this as any;
	}

	public innerJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TableColumns<TJoinedTable>>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public innerJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public innerJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback?: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	) {
		return this.join(value, callback, 'inner', partialCallback);
	}

	public leftJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TableColumns<TJoinedTable>>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public leftJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public leftJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback?: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	) {
		return this.join(value, callback, 'left', partialCallback);
	}

	public rightJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TableColumns<TJoinedTable>>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public rightJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public rightJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback?: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	) {
		return this.join(value, callback, 'right', partialCallback);
	}

	public fullJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TableColumns<TJoinedTable>>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public fullJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	): PickJoin<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
			Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>
	>;
	public fullJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback?: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	) {
		return this.join(value, callback, 'full', partialCallback);
	}

	public where(
		where:
			| ((joins: TJoins) => AnyPgSQL<(keyof TJoins & string) | TableName<TTable>>)
			| AnyPgSQL<TableName<TTable>>,
	): PickWhere<this> {
		if (where instanceof SQL) {
			this.config.where = where;
		} else {
			this.config.where = where(this._joins);
		}
		return this;
	}

	public distinct(column: AnyPgColumn<TableName<TTable>>): PickDistinct<this> {
		this.config.distinct = column;
		return this;
	}

	public orderBy(
		orderBy:
			| ((
				joins: TJoins,
			) =>
				| AnyPgSQL<(keyof TJoins & string) | TableName<TTable>>[]
				| AnyPgSQL<(keyof TJoins & string) | TableName<TTable>>)
			| (AnyPgSQL<TableName<TTable>>[] | AnyPgSQL<TableName<TTable>>),
	): PickOrderBy<this> {
		if (orderBy instanceof SQL || Array.isArray(orderBy)) {
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			const orderByRes = orderBy(this._joins);
			this.config.orderBy = Array.isArray(orderByRes) ? orderByRes : [orderByRes];
		}
		return this;
	}

	public limit(limit: number): PickLimit<this> {
		this.config.limit = limit;
		return this;
	}

	public offset(offset: number): PickOffset<this> {
		this.config.offset = offset;
		return this;
	}

	public async execute(): Promise<SelectResult<TTable, TReturn, TInitialSelect>> {
		const query = this.dialect.buildSelectQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		return result.rows.map((row) => this.table[tableRowMapper](this.fields, row)) as SelectResult<
			TTable,
			TReturn,
			TInitialSelect
		>;
	}
}
