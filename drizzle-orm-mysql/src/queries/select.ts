import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SQL, SQLWrapper } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlDialect, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered } from '~/operations';
import { AnyMySQL, MySQL, MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, GetTableColumns, MySqlTable } from '~/table';

import { TableProxyHandler } from './proxies';

import {
	AnyMySqlSelect,
	AppendToAliases,
	AppendToJoinsNotNull as AppendToJoinsNotNullable,
	AppendToResult,
	GetSelectedFields,
	JoinNullability,
	JoinOn,
	JoinSelect,
	JoinsValue,
	JoinType,
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
	TJoinedDBTableNames extends string = Unwrap<GetTableConfig<TTable, 'name'>>,
	TJoinsNotNullable extends Record<string, JoinNullability> = {
		[Key in TTableNamesMap[TJoinedDBTableNames]]: 'not-null';
	},
> implements SQLWrapper {
	protected typeKeeper!: {
		table: TTable;
		initialSelect: TInitialSelectResultFields;
		result: TResult;
		aliases: TAliases;
	};

	private config: MySqlSelectConfig;
	private aliases: TAliases = {} as TAliases;
	private joinsNotNullable: Record<string, boolean>;

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
		this.joinsNotNullable = { [table[tableNameSym]]: true };
	}

	private createJoin<TJoinType extends JoinType>(joinType: TJoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
			TDBName extends Unwrap<GetTableConfig<TJoinedTable, 'name'>>,
			TJoinedName extends TTableNamesMap[TDBName],
			TSelect extends JoinSelect<TJoinedTable, TJoinedName, MySqlSelectFields<TableName>> = JoinSelect<
				TJoinedTable,
				TJoinedName,
				GetTableColumns<TJoinedTable>
			>,
		>(
			table: TJoinedTable,
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, TJoinedTable, TJoinedName, TDBName>,
			select?: TSelect,
		): MySqlSelect<
			TTable,
			TTableNamesMap,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, GetSelectedFields<TSelect>>,
			TAliases,
			TJoinedDBTableNames | TDBName,
			AppendToJoinsNotNullable<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join<
			TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
			TJoinedName extends string,
			TSelect extends JoinSelect<TJoinedTable, TJoinedName, MySqlSelectFields<TableName>> = JoinSelect<
				TJoinedTable,
				TJoinedName,
				GetTableColumns<TJoinedTable>
			>,
		>(
			alias: { [Key in TJoinedName]: TJoinedTable },
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, TJoinedTable, TJoinedName>,
			select?: TSelect,
		): MySqlSelect<
			TTable,
			TTableNamesMap,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, GetSelectedFields<TSelect>>,
			AppendToAliases<TAliases, TJoinedTable, TJoinedName>,
			TJoinedDBTableNames | TJoinedName,
			AppendToJoinsNotNullable<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join(
			aliasConfig: AnyMySqlTable | Record<string, AnyMySqlTable>,
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, AnyMySqlTable, string>,
			select?: ((table: AnyMySqlTable) => Record<string, AnyMySqlColumn>) | Record<string, AnyMySqlColumn>,
		): AnyMySqlSelect {
			let aliasName: string, joinedTable: AnyMySqlTable;
			if (aliasConfig instanceof MySqlTable) {
				aliasName = aliasConfig[tableNameSym];
				joinedTable = aliasConfig;
			} else {
				const config = Object.entries(aliasConfig)[0];
				if (!config) {
					throw new Error('Join alias is an empty object');
				}
				[aliasName, joinedTable] = config;
			}
			const joinName = self.tableNamesMap[joinedTable[tableNameSym]]!;

			const tableAliasProxy = new Proxy(joinedTable, new TableProxyHandler(aliasName));

			if (!(aliasConfig instanceof MySqlTable)) {
				Object.assign(self.aliases, { [aliasName]: tableAliasProxy });
			}

			const onExpression = typeof on === 'function' ? on(self.aliases) : on;

			const partialFields = typeof select === 'function' ? select(tableAliasProxy) : select;

			self.fields.push(...self.dialect.orderSelectedFields(partialFields ?? tableAliasProxy[tableColumns], joinName));

			self.config.joins[joinName] = {
				on: onExpression,
				table: joinedTable,
				joinType,
				aliasTable: tableAliasProxy,
			};

			switch (joinType) {
				case 'left':
					self.joinsNotNullable[joinName] = false;
					break;
				case 'right':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, false]),
					);
					self.joinsNotNullable[joinName] = true;
					break;
				case 'inner':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, true]),
					);
					self.joinsNotNullable[joinName] = true;
					break;
				case 'full':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, false]),
					);
					self.joinsNotNullable[joinName] = false;
					break;
			}

			return self;
		}

		return join;
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	public where(
		where:
			| ((
				aliases: TAliases,
			) => MySQL<
				TableName<TJoinedDBTableNames> | TableName<keyof TAliases & string> | GetTableConfig<TTable, 'name'> | TableName
			>)
			| MySQL<TableName<TJoinedDBTableNames> | GetTableConfig<TTable, 'name'> | TableName>
			| undefined,
	): PickWhere<this> {
		if (where instanceof SQL) {
			this.config.where = where;
		} else {
			this.config.where = where?.(this.aliases);
		}
		return this;
	}

	public orderBy(
		columns: (
			joins: TAliases,
		) =>
			| MySQL<TableName<TJoinedDBTableNames> | GetTableConfig<TTable, 'name'>>[]
			| MySQL<TableName<TJoinedDBTableNames> | GetTableConfig<TTable, 'name'>>,
	): PickOrderBy<this>;
	public orderBy(
		...columns: MySQL<TableName<TJoinedDBTableNames> | GetTableConfig<TTable, 'name'>>[]
	): PickOrderBy<this>;
	public orderBy(
		firstColumn: ((joins: TAliases) => AnyMySQL[] | AnyMySQL) | AnyMySQL,
		...otherColumns: AnyMySQL[]
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

	public getSQL(): AnyMySQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	public getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<
		SelectResult<TTable, TResult, TInitialSelectResultFields, TTableNamesMap, TJoinsNotNullable>
	> {
		const query = this.dialect.buildSelectQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		return result[0].map((row: any) => mapResultRow(this.fields, row, this.joinsNotNullable)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TTableNamesMap,
			TJoinsNotNullable
		>;
	}
}
