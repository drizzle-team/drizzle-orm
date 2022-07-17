import { AnyTable } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn, PgColumn } from '~/columns/common';
import { AnyPgDialect, PgDriverParam, PgSession } from '~/connection';
import { PartialSelectResult, PgSelectFields } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType, PgTable, TableColumns } from '~/table';

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

export type BuildAlias<
	TTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
> = `${TableName<TTable>}${GetAliasIndex<TableName<TTable>, TAlias>}`;

export type TableAlias<TTable extends AnyPgTable, TAlias extends string> = AliasColumns<TableColumns<TTable>, TAlias>;

export type AliasColumns<TColumns, TAlias extends string> = {
	[Key in keyof TColumns]: TColumns[Key] extends PgColumn<
		any,
		infer TType,
		infer TDriverParam,
		infer TNotNull,
		infer TDefault
	> ? PgColumn<TAlias, TType, TDriverParam, TNotNull, TDefault>
		: never;
};

type Increment<TNumber extends number, TCounter extends any[] = []> = TCounter['length'] extends TNumber
	? [...TCounter, 0]['length']
	: Increment<TNumber, [...TCounter, 0]>;

export type IncrementAlias<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [key in TTableName]: infer N } ? N extends number ? Simplify<
			& Omit<TAlias, TTableName>
			& {
				[K in TTableName]: Increment<N>;
			}
		>
	: never
	: Omit<TAlias, TTableName> & { [Key in TTableName]: 2 };

export type GetAliasIndex<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [name in TTableName]: infer N } ? (N extends number ? N : never) : 1;

export class ColumnProxyHandler<TColumn extends AnyPgColumn> implements ProxyHandler<TColumn> {
	public constructor(private table: AnyPgTable) {
	}

	public get(columnObj: TColumn, prop: string | symbol, receiver: any): any {
		if (prop === 'table') {
			return this.table;
		}
		return columnObj[prop as keyof TColumn];
	}
}

export class TableProxyHandler<TJoinedTable extends AnyPgTable> implements ProxyHandler<TJoinedTable> {
	public constructor(private alias: string) {
	}

	public get(tableObj: TJoinedTable, prop: string | symbol, receiver: any): any {
		if (prop === tableName) {
			return this.alias;
		}
		if (prop === tableColumns) {
			const proxiedColumns: { [key: string]: any } = {};
			Object.keys(tableObj[tableColumns]).map((key) => {
				proxiedColumns[key] = new Proxy(
					tableObj[tableColumns][key] as unknown as AnyPgColumn,
					new ColumnProxyHandler(new Proxy(tableObj, this)),
				);
			});
			return proxiedColumns;
		}
		if (typeof prop !== 'string') {
			return tableObj[prop as keyof TJoinedTable];
		}
		return new Proxy(
			tableObj[prop as keyof TJoinedTable] as unknown as AnyPgColumn,
			new ColumnProxyHandler(new Proxy(tableObj, this)),
		);
	}
}

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
	TInitialSelect extends InferType<TTable> | PartialSelectResult<TableName<TTable>, PgSelectFields<TableName<TTable>>>,
> = TReturn extends undefined ? TInitialSelect[]
	: (Simplify<TReturn & { [k in TableName<TTable>]: TInitialSelect }>)[];

export type AppendToReturn<TReturn, TAlias extends string, TSelectedFields extends PgSelectFields<string>> =
	TReturn extends undefined ? { [Key in TAlias]: PartialSelectResult<string, TSelectedFields> }
		: Simplify<TReturn & { [Key in TAlias]: PartialSelectResult<string, TSelectedFields> }>;

export class PgSelect<
	TTable extends AnyPgTable,
	TInitialSelect extends InferType<TTable> | PartialSelectResult<TableName<TTable>, PgSelectFields<TableName<TTable>>>,
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
				& TJoins
				& {
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				}
			>,
		) => AnyPgSQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>,
		joinType: string,
		partialCallback?: (
			table: TableAlias<
				TJoinedTable,
				BuildAlias<
					TJoinedTable,
					TAlias
				>
			>,
		) => TSelectedFields,
	): Pick<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
			Simplify<
				& TJoins
				& {
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				}
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>,
		'offset' | 'limit' | 'execute' | 'innerJoin' | 'where' | 'orderBy'
	> {
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

	public innerJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: Simplify<
				& TJoins
				& {
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>,
	): Pick<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TableColumns<TJoinedTable>>,
			Simplify<
				& TJoins
				& {
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>,
		'offset' | 'limit' | 'execute' | 'innerJoin' | 'where' | 'orderBy'
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
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback: (
			table: TableAlias<
				TJoinedTable,
				BuildAlias<
					TJoinedTable,
					TAlias
				>
			>,
		) => TSelectedFields,
	): Pick<
		PgSelect<
			TTable,
			TInitialSelect,
			AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
			Simplify<
				& TJoins
				& {
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
			IncrementAlias<TableName<TJoinedTable>, TAlias>
		>,
		'offset' | 'limit' | 'execute' | 'innerJoin' | 'where' | 'orderBy'
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
					[
						Alias in BuildAlias<
							TJoinedTable,
							TAlias
						>
					]: TableAlias<TJoinedTable, Alias>;
				},
				{ deep: true }
			>,
		) => AnyPgSQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback?: (
			table: TableAlias<
				TJoinedTable,
				BuildAlias<
					TJoinedTable,
					TAlias
				>
			>,
		) => TSelectedFields,
	) {
		return this.join(value, callback, 'INNER JOIN', partialCallback);
	}

	public where(
		where: ((joins: TJoins) => AnyPgSQL<(keyof TJoins & string) | TableName<TTable>>) | AnyPgSQL<TableName<TTable>>,
	): Omit<this, 'distinct' | 'where'> {
		if (where instanceof SQL) {
			this.config.where = where;
		} else {
			this.config.where = where(this._joins);
		}
		return this;
	}

	public distinct(column: AnyPgColumn<TableName<TTable>>): Omit<this, 'distinct'> {
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
	): Pick<this, 'limit' | 'offset' | 'execute'> {
		if (orderBy instanceof SQL || Array.isArray(orderBy)) {
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			const orderByRes = orderBy(this._joins);
			this.config.orderBy = Array.isArray(orderByRes) ? orderByRes : [orderByRes];
		}
		return this;
	}

	public limit(limit: number): Pick<this, 'offset' | 'execute'> {
		this.config.limit = limit;
		return this;
	}

	public offset(offset: number): Pick<this, 'execute'> {
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
