import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SQL, SQLWrapper } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from '~/columns/common';
import { AnySQLiteDialect, SQLiteSession } from '~/connection';
import { SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { AnySQLiteSQL, SQLitePreparedQuery } from '~/sql';
import { AnySQLiteTable, GetTableColumns, SQLiteTable } from '~/table';

import { TableProxyHandler } from './proxies';

import {
	AnySQLiteSelect,
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

export interface SQLiteSelectConfig {
	fields: SQLiteSelectFieldsOrdered;
	where?: AnySQLiteSQL | undefined;
	table: AnySQLiteTable;
	limit?: number;
	offset?: number;
	joins: { [k: string]: JoinsValue };
	orderBy: AnySQLiteSQL[];
}

export class SQLiteSelect<
	TTable extends AnySQLiteTable,
	TTableNamesMap extends Record<string, string>,
	TInitialSelectResultFields extends Record<string, unknown>,
	TResult = undefined,
	// TAliases is really a map of table name => joined table, but I failed to prove that to TS
	TAliases extends { [tableName: string]: any } = {},
	TJoinedDBTableNames extends string = Unwrap<GetTableName<TTable>>,
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

	private config: SQLiteSelectConfig;
	private aliases: TAliases = {} as TAliases;
	private joinsNotNullable: Record<string, boolean>;

	constructor(
		private table: SQLiteSelectConfig['table'],
		private fields: SQLiteSelectConfig['fields'],
		private session: SQLiteSession,
		private dialect: AnySQLiteDialect,
		private tableNamesMap: TTableNamesMap,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
		this.joinsNotNullable = { [table[tableName]]: true };
	}

	private createJoin<TJoinType extends JoinType>(joinType: TJoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnySQLiteTable<TableName<keyof TTableNamesMap & string>>,
			TDBName extends Unwrap<GetTableName<TJoinedTable>>,
			TJoinedName extends TTableNamesMap[TDBName],
			TSelect extends JoinSelect<TJoinedTable, TJoinedName, SQLiteSelectFields<TableName>> = JoinSelect<
				TJoinedTable,
				TJoinedName,
				GetTableColumns<TJoinedTable>
			>,
		>(
			table: TJoinedTable,
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, TJoinedTable, TJoinedName, TDBName>,
			select?: TSelect,
		): SQLiteSelect<
			TTable,
			TTableNamesMap,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, GetSelectedFields<TSelect>>,
			TAliases,
			TJoinedDBTableNames | TDBName,
			AppendToJoinsNotNullable<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join<
			TJoinedTable extends AnySQLiteTable<TableName<keyof TTableNamesMap & string>>,
			TJoinedName extends string,
			TSelect extends JoinSelect<TJoinedTable, TJoinedName, SQLiteSelectFields<TableName>> = JoinSelect<
				TJoinedTable,
				TJoinedName,
				GetTableColumns<TJoinedTable>
			>,
		>(
			alias: { [Key in TJoinedName]: TJoinedTable },
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, TJoinedTable, TJoinedName>,
			select?: TSelect,
		): SQLiteSelect<
			TTable,
			TTableNamesMap,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, GetSelectedFields<TSelect>>,
			AppendToAliases<TAliases, TJoinedTable, TJoinedName>,
			TJoinedDBTableNames | TJoinedName,
			AppendToJoinsNotNullable<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join(
			aliasConfig: AnySQLiteTable | Record<string, AnySQLiteTable>,
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, AnySQLiteTable, string>,
			select?: ((table: AnySQLiteTable) => Record<string, AnySQLiteColumn>) | Record<string, AnySQLiteColumn>,
		): AnySQLiteSelect {
			let aliasName: string, joinedTable: AnySQLiteTable;
			if (aliasConfig instanceof SQLiteTable) {
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

			if (!(aliasConfig instanceof SQLiteTable)) {
				Object.assign(self.aliases, { [aliasName]: tableAliasProxy });
			}

			const onExpression = on instanceof Function ? on(self.aliases as any) : on;

			const partialFields = select instanceof Function ? select(tableAliasProxy) : select;

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
			| ((aliases: TAliases) => AnySQLiteSQL<TableName<keyof TAliases & string> | GetTableName<TTable>>)
			| AnySQLiteSQL<GetTableName<TTable>>
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
			| AnySQLiteSQL<TableName<TJoinedDBTableNames> | GetTableName<TTable>>[]
			| AnySQLiteSQL<TableName<TJoinedDBTableNames> | GetTableName<TTable>>,
	): PickOrderBy<this>;
	public orderBy(
		...columns: AnySQLiteSQL<TableName<TJoinedDBTableNames> | GetTableName<TTable>>[]
	): PickOrderBy<this>;
	public orderBy(
		firstColumn: ((joins: TAliases) => AnySQLiteSQL[] | AnySQLiteSQL) | AnySQLiteSQL,
		...otherColumns: AnySQLiteSQL[]
	): PickOrderBy<this> {
		let columns: AnySQLiteSQL[];
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

	public getSQL(): AnySQLiteSQL<GetTableName<TTable>> {
		return this.dialect.buildSelectQuery(this.config);
	}

	public getQuery(): SQLitePreparedQuery {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public execute(): SelectResult<TTable, TResult, TInitialSelectResultFields, TTableNamesMap, TJoinsNotNullable> {
		const query = this.dialect.buildSelectQuery(this.config);
		const rows = this.session.all(query);
		return rows.map((row) => mapResultRow(this.fields, row, this.joinsNotNullable)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TTableNamesMap,
			TJoinsNotNullable
		>;
	}
}
