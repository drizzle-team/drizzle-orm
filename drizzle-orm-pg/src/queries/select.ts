import { AnyTable } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn, PgColumn } from '~/columns/common';
import { AnyPgDialect, PgDriverParam, PgSession } from '~/connection';
import { PartialSelectResult, PgSelectFields } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType, PgTable, TableColumns } from '~/table';

import { TableProxyHandler } from './proxies';
import { AppendToReturn, BuildAlias, IncrementAlias, TableAlias } from './types';

export interface PgSelectConfig<TTable extends AnyTable> {
	fields: PgSelectFields<TableName<TTable>> | undefined;
	where: AnyPgSQL<TableName<TTable>>;
	table: TTable;
	limit: number | undefined;
	offset: number | undefined;
	distinct: AnyPgColumn<TableName<TTable>> | undefined;
	joins: { [k: string]: JoinsValue<any> };
	orderBy: AnyPgSQL<TableName<TTable>>[];
}

export type AnyPgSelectConfig = PgSelectConfig<AnyPgTable>;

interface JoinsValue<TColumns extends Record<string, AnyPgColumn<string>>> {
	columns: TColumns;
	on: AnyPgSQL;
	table: AnyPgTable;
	// make union
	joinType?: string;
	alias: AnyPgTable;
}

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelect extends
		| InferType<TTable>
		| PartialSelectResult<TableName<TTable>, PgSelectFields<TableName<TTable>>>,
> = TReturn extends undefined
	? TInitialSelect[]
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

	private config: AnyPgSelectConfig = {} as AnyPgSelectConfig;
	private _alias!: TAlias;
	private _joins: TJoins = {} as TJoins;

	constructor(
		private table: TTable,
		private fields: PgSelectFields<TableName<TTable>> | undefined,
		private session: PgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.config.fields = fields;
		this.config.table = table;
		this._alias = { [table[tableName]]: 1 } as TAlias;
		this.config.joins = {};
		this.config.orderBy = [];
	}

	private join<
		TJoinedTable extends PgTable<TableName<TJoinedTable>, any>,
		TSelectedFields extends PgSelectFields<BuildAlias<TJoinedTable, TAlias>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				TJoins & {
					[Alias in BuildAlias<TJoinedTable, TAlias>]: TableAlias<TJoinedTable, Alias>;
				}
			>,
		) => AnyPgSQL<
			(keyof TJoins & string) | TableName<TTable> | BuildAlias<TJoinedTable, TAlias>
		>,
		joinType: string,
		partialCallback?: (
			table: TableAlias<TJoinedTable, BuildAlias<TJoinedTable, TAlias>>,
		) => TSelectedFields,
	) {
		const originalName = value[tableName];
		let aliasIndex = this._alias[originalName];
		if (typeof aliasIndex === 'undefined') {
			this._alias[originalName] = aliasIndex = 1 as TAlias[TableName<TJoinedTable>];
		}

		const alias: keyof TJoins = `${originalName}${aliasIndex}`;
		this._alias[originalName]++;

		const tableAsProxy = new Proxy(value, new TableProxyHandler(alias));

		Object.assign(this._joins, { [alias]: tableAsProxy });

		const onExpression = callback(this._joins as any);

		const partialFields = partialCallback ? partialCallback(tableAsProxy as any) : undefined;

		this.config.joins[alias as any] = {
			columns: partialFields ?? tableAsProxy[tableColumns],
			on: onExpression,
			table: value,
			joinType,
			alias: tableAsProxy,
		};

		return this as any;
	}

	public innerJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
		return this.join(value, callback, 'inner join', partialCallback);
	}

	public leftJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
		return this.join(value, callback, 'left join', partialCallback);
	}

	public rightJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
		return this.join(value, callback, 'right join', partialCallback);
	}

	public fullJoin<TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
				TJoins & {
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
		return this.join(value, callback, 'full join', partialCallback);
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
		return this.session.query(sql, params).then((result) => {
			return this.mapper(result.rows) as unknown as any;
		});
	}
}
