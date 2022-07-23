import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SQL, SQLResponse, SQLWrapper } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName, tableRowMapper } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgDialect, BuildTableNamesMap, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered } from '~/operations';
import { AnyPgSQL, PgPreparedQuery } from '~/sql';
import { AnyPgTable, GetTableColumns } from '~/table';

import { TableProxyHandler } from './proxies';
import {
	AppendToJoins,
	AppendToReturn,
	BuildAliasName,
	BuildAliasTable,
	IncrementAlias,
	JoinsValue,
	JoinType,
	PickJoin,
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
	TReturn = undefined,
	// TJoins is really a map of table name => joined table, but I failed to prove that to TS
	TJoins extends { [tableName: string]: any } = {},
	TAlias extends { [name: string]: number } = {},
> implements SQLWrapper {
	protected typeKeeper!: {
		table: TTable;
		initialSelect: TInitialSelectResultFields;
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
		Object.values(fields).forEach((field) => {
			if (field instanceof SQLResponse) {
				field.tableName = table[tableName];
			}
		});

		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
		this._alias = { [table[tableName] as string]: 1 } as TAlias;
	}

	private createJoin(joinType: JoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnyPgTable<TableName<keyof TTableNamesMap & string>>,
			TAliasName extends TableName<BuildAliasName<TJoinedTable, TTableNamesMap, TAlias>>,
		>(
			value: TJoinedTable,
			on: (
				joins: AppendToJoins<TJoins, TJoinedTable, TAlias, TTableNamesMap>,
			) => AnyPgSQL<
				TableName<keyof TJoins & string> | GetTableName<TTable> | TAliasName
			>,
		): PickJoin<
			PgSelect<
				TTable,
				TTableNamesMap,
				TInitialSelectResultFields,
				AppendToReturn<TReturn, TAliasName, GetTableColumns<TJoinedTable>>,
				AppendToJoins<TJoins, TJoinedTable, TAlias, TTableNamesMap>,
				IncrementAlias<TJoinedTable, TAlias>
			>
		>;
		function join<
			TJoinedTable extends AnyPgTable<TableName<keyof TTableNamesMap & string>>,
			TAliasName extends TableName<BuildAliasName<TJoinedTable, TTableNamesMap, TAlias>>,
			TSelectedFields extends PgSelectFields<TAliasName>,
		>(
			value: TJoinedTable,
			on: (
				joins: AppendToJoins<TJoins, TJoinedTable, TAlias, TTableNamesMap>,
			) => AnyPgSQL<
				TableName<keyof TJoins & string> | GetTableName<TTable> | TAliasName
			>,
			select: (
				table: BuildAliasTable<TJoinedTable, TAliasName>,
			) => TSelectedFields,
		): PickJoin<
			PgSelect<
				TTable,
				TTableNamesMap,
				TInitialSelectResultFields,
				AppendToReturn<TReturn, TAliasName, TSelectedFields>,
				AppendToJoins<TJoins, TJoinedTable, TAlias, TTableNamesMap>,
				IncrementAlias<TJoinedTable, TAlias>
			>
		>;
		function join<
			TJoinedTable extends AnyPgTable,
			TAliasName extends TableName<BuildAliasName<TJoinedTable, TTableNamesMap, TAlias>>,
			TSelectedFields extends PgSelectFields<TAliasName>,
		>(
			joinedTable: TJoinedTable,
			on: (
				joins: AppendToJoins<TJoins, TJoinedTable, TAlias, TTableNamesMap>,
			) => AnyPgSQL<
				TableName<keyof TJoins & string> | GetTableName<TTable> | TAliasName
			>,
			select?: (
				table: BuildAliasTable<TJoinedTable, TAliasName>,
			) => TSelectedFields,
		) {
			const joinedTableName = joinedTable[tableName] as keyof TAlias & string;
			let aliasIndex = self._alias[joinedTableName];
			if (typeof aliasIndex === 'undefined') {
				self._alias[joinedTableName] = aliasIndex = 1 as TAlias[Unwrap<GetTableName<TJoinedTable>>];
			}

			const alias = `${joinedTableName}${aliasIndex}`;
			self._alias[joinedTableName]++;

			const tableAliasProxy = new Proxy(joinedTable, new TableProxyHandler(alias));

			Object.assign(self._joins, { [alias]: tableAliasProxy });

			const onExpression = on(self._joins as any);

			const partialFields = select?.(
				tableAliasProxy as BuildAliasTable<TJoinedTable, TAliasName>,
			);

			if (partialFields) {
				Object.values(partialFields).forEach((field) => {
					if (field instanceof SQLResponse) {
						field.tableName = alias as TableName;
					}
				});
			}

			self.fields.push(...self.dialect.orderSelectedFields(partialFields ?? tableAliasProxy[tableColumns]));

			self.config.joins[alias] = {
				on: onExpression,
				table: joinedTable,
				joinType,
				alias: tableAliasProxy,
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
			| ((joins: TJoins) => AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>)
			| AnyPgSQL<GetTableName<TTable>>
			| undefined,
	): PickWhere<this> {
		if (where instanceof SQL) {
			this.config.where = where;
		} else {
			this.config.where = where?.(this._joins);
		}
		return this;
	}

	public whereUnsafe(
		where:
			| ((joins: TJoins) => AnyPgSQL)
			| AnyPgSQL,
	): PickWhere<this> {
		return this.where(
			where as
				| ((joins: TJoins) => AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>)
				| AnyPgSQL<GetTableName<TTable>>,
		);
	}

	public orderBy(
		columns: (
			joins: TJoins,
		) =>
			| AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>[]
			| AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>,
	): PickOrderBy<this>;
	public orderBy(
		...columns: AnyPgSQL<GetTableName<TTable>>[]
	): PickOrderBy<this>;
	public orderBy(
		firstColumn:
			| ((
				joins: TJoins,
			) =>
				| AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>[]
				| AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>)
			| AnyPgSQL<GetTableName<TTable>>,
		...otherColumns: AnyPgSQL<GetTableName<TTable>>[]
	): PickOrderBy<this> {
		let columns: AnyPgSQL[];
		if (firstColumn instanceof SQL) {
			columns = [firstColumn, ...otherColumns];
		} else {
			const firstColumnResult = firstColumn(this._joins);
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

	public async execute(): Promise<SelectResult<TTable, TReturn, TInitialSelectResultFields>> {
		const query = this.dialect.buildSelectQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		return result.rows.map((row) => this.table[tableRowMapper](this.fields, row)) as SelectResult<
			TTable,
			TReturn,
			TInitialSelectResultFields
		>;
	}
}
