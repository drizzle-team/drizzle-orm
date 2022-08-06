import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SQL, SQLResponse, SQLWrapper } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName, tableRowMapper } from 'drizzle-orm/utils';

import { AnyPgColumn } from '~/columns/common';
import { AnyPgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered } from '~/operations';
import { AnyPgSQL, PgPreparedQuery } from '~/sql';
import { AnyPgTable, GetTableColumns, PgTable } from '~/table';

import { TableProxyHandler } from './proxies';

import {
	AnyPgSelect,
	AppendToAliases,
	AppendToJoinsNotNull as AppendToJoinsNotNullable,
	AppendToResult,
	GetSelectedFields,
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

export interface PgSelectConfig {
	fields: PgSelectFieldsOrdered;
	where?: AnyPgSQL | undefined;
	table: AnyPgTable;
	limit?: number;
	offset?: number;
	joins: { [k: string]: JoinsValue };
	orderBy: AnyPgSQL[];
}

export class PgSelect<
	TTable extends AnyPgTable,
	TTableNamesMap extends Record<string, string>,
	TInitialSelectResultFields extends Record<string, unknown>,
	TResult = undefined,
	// TAliases is really a map of table name => joined table, but I failed to prove that to TS
	TAliases extends { [tableName: string]: any } = {},
	TJoinedDBTableNames extends string = Unwrap<GetTableName<TTable>>,
	TJoinsNotNullable extends Record<string, boolean> = { [Key in TTableNamesMap[TJoinedDBTableNames]]: true },
> implements SQLWrapper {
	protected typeKeeper!: {
		table: TTable;
		initialSelect: TInitialSelectResultFields;
		result: TResult;
		aliases: TAliases;
	};

	private config: PgSelectConfig;
	private aliases: TAliases = {} as TAliases;

	constructor(
		private table: PgSelectConfig['table'],
		private fields: PgSelectConfig['fields'],
		private session: PgSession,
		private dialect: AnyPgDialect,
		private tableNamesMap: TTableNamesMap,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
	}

	private createJoin<TJoinType extends JoinType>(joinType: TJoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnyPgTable<TableName<keyof TTableNamesMap & string>>,
			TDBName extends Unwrap<GetTableName<TJoinedTable>>,
			TJoinedName extends TTableNamesMap[TDBName],
			TSelect extends JoinSelect<TJoinedTable, TJoinedName, PgSelectFields<TableName>> = JoinSelect<
				TJoinedTable,
				TJoinedName,
				GetTableColumns<TJoinedTable>
			>,
		>(
			table: TJoinedTable,
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, TJoinedTable, TJoinedName, TDBName>,
			select?: TSelect,
		): PgSelect<
			TTable,
			TTableNamesMap,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, GetSelectedFields<TSelect>>,
			TAliases,
			TJoinedDBTableNames | TDBName,
			AppendToJoinsNotNullable<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join<
			TJoinedTable extends AnyPgTable<TableName<keyof TTableNamesMap & string>>,
			TJoinedName extends string,
			TSelect extends JoinSelect<TJoinedTable, TJoinedName, PgSelectFields<TableName>> = JoinSelect<
				TJoinedTable,
				TJoinedName,
				GetTableColumns<TJoinedTable>
			>,
		>(
			alias: { [Key in TJoinedName]: TJoinedTable },
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, TJoinedTable, TJoinedName>,
			select?: TSelect,
		): PgSelect<
			TTable,
			TTableNamesMap,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, GetSelectedFields<TSelect>>,
			AppendToAliases<TAliases, TJoinedTable, TJoinedName>,
			TJoinedDBTableNames | TJoinedName,
			AppendToJoinsNotNullable<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join(
			aliasConfig: AnyPgTable | Record<string, AnyPgTable>,
			on: JoinOn<TTableNamesMap, TJoinedDBTableNames, TAliases, AnyPgTable, string>,
			select?: ((table: AnyPgTable) => Record<string, AnyPgColumn>) | Record<string, AnyPgColumn>,
		): AnyPgSelect {
			let aliasName: string, joinedTable: AnyPgTable;
			if (aliasConfig instanceof PgTable) {
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

			if (!(aliasConfig instanceof PgTable)) {
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
			| ((aliases: TAliases) => AnyPgSQL<TableName<keyof TAliases & string> | GetTableName<TTable>>)
			| AnyPgSQL<GetTableName<TTable>>
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
			| AnyPgSQL<TableName<TJoinedDBTableNames> | GetTableName<TTable>>[]
			| AnyPgSQL<TableName<TJoinedDBTableNames> | GetTableName<TTable>>,
	): PickOrderBy<this>;
	public orderBy(
		...columns: AnyPgSQL<TableName<TJoinedDBTableNames> | GetTableName<TTable>>[]
	): PickOrderBy<this>;
	public orderBy(
		firstColumn: ((joins: TAliases) => AnyPgSQL[] | AnyPgSQL) | AnyPgSQL,
		...otherColumns: AnyPgSQL[]
	): PickOrderBy<this> {
		let columns: AnyPgSQL[];
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

	public getSQL(): AnyPgSQL<GetTableName<TTable>> {
		return this.dialect.buildSelectQuery(this.config);
	}

	public getQuery(): PgPreparedQuery {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<
		SelectResult<TTable, TResult, TInitialSelectResultFields, TTableNamesMap, TJoinsNotNullable>
	> {
		const query = this.dialect.buildSelectQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		return result.rows.map((row) => this.table[tableRowMapper](this.fields, row)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TTableNamesMap,
			TJoinsNotNullable
		>;
	}
}
