import { AnyTable } from 'drizzle-orm';
import { SelectFields } from 'drizzle-orm/operations';
import { SQL } from 'drizzle-orm/sql';
import { tableColumns, tableName, TableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgDialect, PgSession } from '~/connection';
import { PartialSelectResult } from '~/operations';
import { AnyPgTable, InferType, PgTable, TableColumns } from '~/table';
import { PgColumn, AnyPgColumn } from '~/columns/common';

export interface PgSelectConfig<TTable extends AnyTable> {
	fields: SelectFields<TableName<TTable>> | undefined;
	where: SQL<TableName<TTable>>;
	table: TTable;
	limit: number | undefined;
	offset: number | undefined;
	distinct: AnyPgColumn<TableName<TTable>> | undefined;
	joins: {[k: string]: JoinsValue<any>};
	orderBy: SQL<TableName<TTable>>[];
}

export type AnyPgSelectConfig = PgSelectConfig<AnyPgTable>;

export type BuildAlias<
	TTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
> = `${TableName<TTable>}${GetAliasIndex<TableName<TTable>, TAlias>}`;

export type TableAlias<TTable extends AnyPgTable, TAlias extends string> =
	PgTable<TAlias, undefined> & AliasColumns<TableColumns<TTable>, TAlias>

export type AliasColumns<TColumns, TAlias extends string> = {
	[Key in keyof TColumns]: TColumns[Key] extends PgColumn<
		any,
		infer TType,
		infer TNotNull,
		infer TDefault
	>
		? PgColumn<TAlias, TType, TNotNull, TDefault>
		: never;
};

// prettier-ignore
export type Increment<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [key in TTableName]: infer N }
	? N extends number
		? Omit<TAlias, TTableName> 
		& {
				[K in TTableName]: 
				[ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
			21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
			38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
		][N];
		  }
		: never
	: Omit<TAlias, TTableName> & {[Key in TTableName]: 2};

export type GetAliasIndex<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [name in TTableName]: infer N } ? (N extends number ? N : never) : 1;

export class ColumnProxyHandler<TColumn extends AnyPgColumn>
    implements ProxyHandler<TColumn> {
    public constructor(private table: AnyPgTable) {

    }

    public get(columnObj: TColumn, prop: string | symbol, receiver: any): any {
		if (prop === 'table') {
			return this.table;
		}
		return columnObj[prop as keyof TColumn];
	}
}

export class TableProxyHandler<TJoinedTable extends AnyPgTable>
    implements ProxyHandler<TJoinedTable> {

    public constructor(private alias: string) {

    }

    public get(tableObj: TJoinedTable, prop: string | symbol, receiver: any): any {
		if (prop === tableName) {
			return this.alias;
		}
		if (prop === tableColumns) {
			const proxiedColumns: {[key: string]: any} = {};
			Object.keys(tableObj[tableColumns]).map(key => {
				proxiedColumns[key] = new Proxy(
					tableObj[tableColumns][key] as unknown as AnyPgColumn, 
					new ColumnProxyHandler(new Proxy(tableObj, this)))
			});
			return proxiedColumns
		}
		if (typeof prop !== 'string'){
			return tableObj[prop as keyof TJoinedTable];
		}
		return new Proxy(
			tableObj[prop as keyof TJoinedTable] as unknown as AnyPgColumn, 
			new ColumnProxyHandler(new Proxy(tableObj, this)))
	}
}

interface JoinsValue<TColumns extends Record<string, AnyPgColumn<string>>> {
	columns: TColumns,
	on: SQL,
	table: AnyPgTable,
	// make union
	joinType?: string,
	alias: AnyPgTable,
}

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelect extends InferType<TTable> | PartialSelectResult<SelectFields<TableName<TTable>>>,
> = TReturn extends undefined
	? TInitialSelect[]
	: (Simplify<TReturn & { [k in TableName<TTable>]: TInitialSelect }>)[];

export type AppendToReturn<TReturn, TAlias extends string, TSelectedFields extends SelectFields<any>> = 
	TReturn extends undefined ? {[Key in TAlias]: PartialSelectResult<TSelectedFields>} : TReturn & {[Key in TAlias]: PartialSelectResult<TSelectedFields>};

export class PgSelect<
	TTable extends AnyPgTable,
	TInitialSelect extends InferType<TTable> | PartialSelectResult<SelectFields<TableName<TTable>>>,
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
		private fields: SelectFields<TableName<TTable>> | undefined,
		private session: PgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.config.fields = fields;
		this.config.table = table;
		this._alias = {[table[tableName]]: 1} as TAlias;
		this.config.joins = {};
		this.config.orderBy = [];
	}

	private join<
	TJoinedTable extends PgTable<TableName<TJoinedTable>, any>,
	TSelectedFields extends SelectFields<BuildAlias<TJoinedTable,
	TAlias
>>,
>(
	value: TJoinedTable,
	callback: (
		joins: TJoins & {
			[Alias in BuildAlias<
				TJoinedTable,
				TAlias
			>]: TableAlias<TJoinedTable, Alias>;
		},
	) => SQL<
		| (keyof TJoins & string)
		| TableName<TTable>
		| BuildAlias<TJoinedTable, TAlias>
	>,
	joinType: string,
	partialCallback?: (table: TableAlias<TJoinedTable, BuildAlias<
		TJoinedTable,
		TAlias
	>>) => TSelectedFields,
): Pick<PgSelect<
	TTable,
	TInitialSelect,
	AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
	TJoins & {
	[Alias in BuildAlias<
		TJoinedTable,
		TAlias
	>]: TableAlias<TJoinedTable, Alias>;
},
	Increment<TableName<TJoinedTable>, TAlias>
>, 'offset' | 'limit' | 'execute' | 'innerJoin'| 'where' | 'orderBy'>  {
		const originalName = value[tableName];
		let aliasIndex = this._alias[originalName];
		if (typeof aliasIndex === 'undefined') {
			this._alias[originalName] = aliasIndex = 1 as TAlias[TableName<TJoinedTable>];
		}

		const alias: keyof TJoins = `${originalName}${aliasIndex}`;
		this._alias[originalName]++;

		const tableAsProxy = new Proxy(value,  new TableProxyHandler(alias));

		Object.assign(this._joins, { [alias]: tableAsProxy })

		const onExpression = callback(this._joins as any);

		const partialFields = partialCallback ? partialCallback(tableAsProxy as any) : undefined

		this.config.joins[alias as any] = {
			columns: partialFields ?? tableAsProxy[tableColumns],
			on: onExpression,
			table: value,
			joinType,
			alias: tableAsProxy,
		}

		return this as unknown as Pick<PgSelect<
		TTable,
		TInitialSelect,
		AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
		TJoins & {
			[Alias in BuildAlias<
				TJoinedTable,
				TAlias
			>]: TableAlias<TJoinedTable, Alias>;
		},
		Increment<TableName<TJoinedTable>, TAlias>
	>, 'offset' | 'limit' | 'execute' | 'innerJoin' | 'where' | 'orderBy'>
	}

	public innerJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: TJoins & {
				[Alias in BuildAlias<
					TJoinedTable,
					TAlias
				>]: TableAlias<TJoinedTable, Alias>;
			},
		) => SQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>
	): Pick<PgSelect<
		TTable,
		TInitialSelect,
		AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TableColumns<TJoinedTable>>,
		TJoins & {
		[Alias in BuildAlias<
			TJoinedTable,
			TAlias
		>]: TableAlias<TJoinedTable, Alias>;
	},
		Increment<TableName<TJoinedTable>, TAlias>
	>, 'offset' | 'limit' | 'execute' | 'innerJoin'| 'where' | 'orderBy'>; 
	public innerJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends SelectFields<BuildAlias<TJoinedTable,
		TAlias
	>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: TJoins & {
				[Alias in BuildAlias<
					TJoinedTable,
					TAlias
				>]: TableAlias<TJoinedTable, Alias>;
			},
		) => SQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback: (table: TableAlias<TJoinedTable, BuildAlias<
			TJoinedTable,
			TAlias
		>>) => TSelectedFields,
	): Pick<PgSelect<
		TTable,
		TInitialSelect,
		AppendToReturn<TReturn, BuildAlias<TJoinedTable, TAlias>, TSelectedFields>,
		TJoins & {
		[Alias in BuildAlias<
			TJoinedTable,
			TAlias
		>]: TableAlias<TJoinedTable, Alias>;
	},
		Increment<TableName<TJoinedTable>, TAlias>
	>, 'offset' | 'limit' | 'execute' | 'innerJoin'| 'where' | 'orderBy'>;
	public innerJoin<
		TJoinedTable extends AnyPgTable<TableName<TJoinedTable>>,
		TSelectedFields extends SelectFields<BuildAlias<TJoinedTable,
		TAlias
	>>,
	>(
		value: TJoinedTable,
		callback: (
			joins: TJoins & {
				[Alias in BuildAlias<
					TJoinedTable,
					TAlias
				>]: TableAlias<TJoinedTable, Alias>;
			},
		) => SQL<
			| (keyof TJoins & string)
			| TableName<TTable>
			| BuildAlias<TJoinedTable, TAlias>
		>,
		partialCallback?: (table: TableAlias<TJoinedTable, BuildAlias<
			TJoinedTable,
			TAlias
		>>) => TSelectedFields,
	) {
		return this.join(value, callback, 'INNER JOIN', partialCallback);
	}

	public where(where: ((joins: TJoins) => SQL<(keyof TJoins & string) | TableName<TTable>>) | SQL<TableName<TTable>>):  Omit<this, 'distinct'| 'where'>{
		if (where instanceof SQL<TableName<TTable>>){
			this.config.where = where;
		} else {
			this.config.where = where(this._joins)
		}
		return this;
	}

	public distinct(column: PgColumn<TableName<TTable>>): Omit<this, 'distinct'> {
		this.config.distinct = column;
		return this;
	}

	public orderBy(orderBy: ((joins: TJoins) => (SQL<(keyof TJoins & string) | TableName<TTable>>[] | SQL<(keyof TJoins & string) | TableName<TTable>>)) | (SQL<TableName<TTable>>[] | SQL<TableName<TTable>>)): Pick<this, 'limit' |'offset' | 'execute'> {
		if (orderBy instanceof SQL<TableName<TTable>> || Array.isArray(orderBy)){
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
