import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SQL, SQLWrapper } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName, tableRowMapper } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlDialect, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered } from '~/operations';
import { AnyMySQL, MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, GetTableColumns, MySqlTable } from '~/table';

import { TableProxyHandler } from './proxies';

import {
	AppendToAliases,
	AppendToResult,
	JoinOn,
	JoinSelect,
	JoinsValue,
	JoinType,
	PickJoin,
	PickLimit,
	PickOffset,
	PickOrderBy,
	PickWhere,
	SelectResult,
} from './select.types';

export interface MySqlSelectConfig {
	fields: MySqlSelectFieldsOrdered;
	where?: AnyMySQL | undefined;
	table: AnyMySqlTable;
	limit?: number;
	offset?: number;
	joins: { [k: string]: JoinsValue };
	orderBy: AnyMySQL[];
}

export class MySqlSelect<
	TTable extends AnyMySqlTable,
	TTableNamesMap extends Record<string, string>,
	TInitialSelectResultFields extends Record<string, unknown>,
	TResult = undefined,
	// TAliases is really a map of table name => joined table, but I failed to prove that to TS
	TAliases extends { [tableName: string]: any } = {},
	TJoinedTableNames extends string = Unwrap<GetTableName<TTable>>,
> implements SQLWrapper {
	protected typeKeeper!: {
		table: TTable;
		initialSelect: TInitialSelectResultFields;
		result: TResult;
		aliases: TAliases;
	};

	private config: MySqlSelectConfig;
	private aliases: TAliases = {} as TAliases;

	constructor(
		private table: MySqlSelectConfig['table'],
		private fields: MySqlSelectConfig['fields'],
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
		private tableNamesMap: TTableNamesMap,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
	}

	private createJoin(joinType: JoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
			TAliasName extends Unwrap<GetTableName<TJoinedTable>>,
			TJoinName extends TTableNamesMap[TAliasName],
		>(
			table: TJoinedTable,
			on: JoinOn<TTableNamesMap, TJoinedTableNames, TAliases, TJoinedTable, TJoinName, TAliasName>,
		): PickJoin<
			MySqlSelect<
				TTable,
				TTableNamesMap,
				TInitialSelectResultFields,
				AppendToResult<TResult, TJoinName, GetTableColumns<TJoinedTable>>,
				TAliases,
				TJoinedTableNames | TAliasName
			>
		>;

		function join<
			TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
			TAliasName extends Unwrap<GetTableName<TJoinedTable>>,
			TJoinName extends TTableNamesMap[TAliasName],
			TSelectedFields extends MySqlSelectFields<GetTableName<TJoinedTable>>,
		>(
			table: TJoinedTable,
			on: JoinOn<TTableNamesMap, TJoinedTableNames, TAliases, TJoinedTable, TJoinName, TAliasName>,
			select: JoinSelect<TJoinedTable, TAliasName, TSelectedFields>,
		): PickJoin<
			MySqlSelect<
				TTable,
				TTableNamesMap,
				TInitialSelectResultFields,
				AppendToResult<TResult, TJoinName, TSelectedFields>,
				TAliases,
				TJoinedTableNames | TAliasName
			>
		>;
		function join<
			TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
			TJoinName extends string,
		>(
			alias: { [Key in TJoinName]: TJoinedTable },
			on: JoinOn<TTableNamesMap, TJoinedTableNames, TAliases, TJoinedTable, TJoinName>,
		): PickJoin<
			MySqlSelect<
				TTable,
				TTableNamesMap,
				TInitialSelectResultFields,
				AppendToResult<TResult, TJoinName, GetTableColumns<TJoinedTable>>,
				AppendToAliases<TAliases, TJoinedTable, TJoinName>,
				TJoinedTableNames | TJoinName
			>
		>;
		function join<
			TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
			TJoinName extends string,
			TSelectedFields extends MySqlSelectFields<TableName<TJoinName>>,
		>(
			alias: { [Key in TJoinName]: TJoinedTable },
			on: JoinOn<TTableNamesMap, TJoinedTableNames, TAliases, TJoinedTable, TJoinName>,
			select: JoinSelect<TJoinedTable, TJoinName, TSelectedFields>,
		): PickJoin<
		MySqlSelect<
				TTable,
				TTableNamesMap,
				TInitialSelectResultFields,
				AppendToResult<TResult, TJoinName, TSelectedFields>,
				AppendToAliases<TAliases, TJoinedTable, TJoinName>,
				TJoinedTableNames | TJoinName
			>
		>;
		function join(
			aliasConfig: AnyMySqlTable | Record<string, AnyMySqlTable>,
			on: JoinOn<TTableNamesMap, TJoinedTableNames, TAliases, AnyMySqlTable, string>,
			select?: ((table: AnyMySqlTable) => Record<string, AnyMySqlColumn>) | Record<string, AnyMySqlColumn>,
		) {
			let aliasName: string, joinedTable: AnyMySqlTable;
			if (aliasConfig instanceof MySqlTable) {
				aliasName = aliasConfig[tableName];
				joinedTable = aliasConfig;
			} else {
				const config = Object.entries(aliasConfig)[0];
				if (!config) {
					throw new Error('Join alias is an empty object');
				}
				[aliasName, joinedTable] = config;
			}
			const joinName = self.tableNamesMap[joinedTable[tableName]]!;

			const tableAliasProxy = new Proxy(joinedTable, new TableProxyHandler(aliasName));

			if (!(aliasConfig instanceof MySqlTable)) {
				Object.assign(self.aliases, { [aliasName]: tableAliasProxy });
			}

			const onExpression = on instanceof Function ? on(self.aliases as any) : on;

			const partialFields = select instanceof Function
				? select(tableAliasProxy)
				: select;

			self.fields.push(...self.dialect.orderSelectedFields(partialFields ?? tableAliasProxy[tableColumns], joinName));

			self.config.joins[joinName] = {
				on: onExpression,
				table: joinedTable,
				joinType,
				aliasTable: tableAliasProxy,
			};

			return self as any;
		}

		return join;
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	public where(
		where:
			| ((aliases: TAliases) => AnyMySQL<TableName<keyof TAliases & string> | GetTableName<TTable>>)
			| AnyMySQL<GetTableName<TTable>>
			| undefined,
	): PickWhere<this> {
		if (where instanceof SQL) {
			this.config.where = where;
		} else {
			this.config.where = where?.(this.aliases);
		}
		return this;
	}

	public whereUnsafe(
		where:
			| ((aliases: TAliases) => AnyMySQL)
			| AnyMySQL
			| undefined,
	): PickWhere<this> {
		return this.where(
			where as
				| ((aliases: TAliases) => AnyMySQL<TableName<keyof TAliases & string> | GetTableName<TTable>>)
				| AnyMySQL<GetTableName<TTable>>
				| undefined,
		);
	}

	public orderBy(
		columns: (
			joins: TAliases,
		) =>
			| AnyMySQL<TableName<keyof TAliases & string> | GetTableName<TTable>>[]
			| AnyMySQL<TableName<keyof TAliases & string> | GetTableName<TTable>>,
	): PickOrderBy<this>;
	public orderBy(
		...columns: AnyMySQL<GetTableName<TTable>>[]
	): PickOrderBy<this>;
	public orderBy(
		firstColumn:
			| ((
				joins: TAliases,
			) =>
				| AnyMySQL<TableName<keyof TAliases & string> | GetTableName<TTable>>[]
				| AnyMySQL<TableName<keyof TAliases & string> | GetTableName<TTable>>)
			| AnyMySQL<GetTableName<TTable>>,
		...otherColumns: AnyMySQL<GetTableName<TTable>>[]
	): PickOrderBy<this> {
		let columns: AnyMySQL[];
		if (firstColumn instanceof SQL) {
			columns = [firstColumn, ...otherColumns];
		} else {
			const firstColumnResult = firstColumn(this.aliases);
			columns = [...(Array.isArray(firstColumnResult) ? firstColumnResult : [firstColumnResult]), ...otherColumns];
		}
		this.config.orderBy = columns;

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

	public getSQL(): AnyMySQL<GetTableName<TTable>> {
		return this.dialect.buildSelectQuery(this.config);
	}

	public getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<SelectResult<TTable, TResult, TInitialSelectResultFields, TTableNamesMap>> {
		const query = this.dialect.buildSelectQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		return result[0].map((row: any) => this.table[tableRowMapper](this.fields, row)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TTableNamesMap
		>;
	}
}
