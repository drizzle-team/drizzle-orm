import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SQL } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName, tableRowMapper } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered } from '~/operations';
import { AnyPgSQL, PgPreparedQuery } from '~/sql';
import { AnyPgTable, GetTableColumns, InferModel } from '~/table';

import { TableProxyHandler } from './proxies';
import { AppendToJoins, AppendToReturn, BuildAliasName, BuildAliasTable, IncrementAlias } from './types';

export interface PgSelectConfig {
	fields: PgSelectFieldsOrdered;
	where?: AnyPgSQL;
	table: AnyPgTable;
	limit?: number;
	offset?: number;
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
	TInitialSelectResultFields extends Record<string, unknown>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: Simplify<TReturn & { [k in Unwrap<GetTableName<TTable>>]: TInitialSelectResultFields }>[];

type AnyPgSelect = PgSelect<AnyPgTable, InferModel<AnyPgTable>, any, any, any>;

export type PickJoin<TJoinReturn extends AnyPgSelect> = TJoinReturn;
export type PickWhere<TJoinReturn extends AnyPgSelect> = Omit<
	TJoinReturn,
	'where' | `${JoinType}Join`
>;
export type PickOrderBy<TJoinReturn extends AnyPgSelect> = Pick<
	TJoinReturn,
	'limit' | 'offset' | 'getQuery' | 'execute'
>;
export type PickLimit<TJoinReturn extends AnyPgSelect> = Pick<TJoinReturn, 'offset' | 'getQuery' | 'execute'>;
export type PickOffset<TJoinReturn extends AnyPgSelect> = Pick<TJoinReturn, 'getQuery' | 'execute'>;

export class PgSelect<
	TTable extends AnyPgTable,
	TInitialSelectResultFields extends Record<string, unknown>,
	TReturn = undefined,
	TJoins extends { [k: string]: any } = {},
	TAlias extends { [name: string]: number } = { [K in GetTableName<TTable>]: 1 },
> {
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
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
		this._alias = { [table[tableName]]: 1 } as TAlias;
	}

	private createJoin(joinType: JoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnyPgTable,
		>(
			value: TJoinedTable,
			on: (
				joins: AppendToJoins<TJoins, TJoinedTable, TAlias>,
			) => AnyPgSQL<
				TableName<keyof TJoins & string> | GetTableName<TTable> | BuildAliasName<TJoinedTable, TAlias>
			>,
		): PickJoin<
			PgSelect<
				TTable,
				TInitialSelectResultFields,
				AppendToReturn<TReturn, BuildAliasName<TJoinedTable, TAlias>, GetTableColumns<TJoinedTable>>,
				AppendToJoins<TJoins, TJoinedTable, TAlias>,
				IncrementAlias<Unwrap<GetTableName<TJoinedTable>>, TAlias>
			>
		>;
		function join<
			TJoinedTable extends AnyPgTable,
			TSelectedFields extends PgSelectFields<BuildAliasName<TJoinedTable, TAlias>>,
		>(
			value: TJoinedTable,
			on: (
				joins: AppendToJoins<TJoins, TJoinedTable, TAlias>,
			) => AnyPgSQL<
				TableName<keyof TJoins & string> | GetTableName<TTable> | BuildAliasName<TJoinedTable, TAlias>
			>,
			select: (
				table: BuildAliasTable<TJoinedTable, BuildAliasName<TJoinedTable, TAlias>>,
			) => TSelectedFields,
		): PickJoin<
			PgSelect<
				TTable,
				TInitialSelectResultFields,
				AppendToReturn<TReturn, BuildAliasName<TJoinedTable, TAlias>, TSelectedFields>,
				AppendToJoins<TJoins, TJoinedTable, TAlias>,
				IncrementAlias<Unwrap<GetTableName<TJoinedTable>>, TAlias>
			>
		>;
		function join<
			TJoinedTable extends AnyPgTable,
			TSelectedFields extends PgSelectFields<BuildAliasName<TJoinedTable, TAlias>>,
		>(
			joinedTable: TJoinedTable,
			on: (
				joins: AppendToJoins<TJoins, TJoinedTable, TAlias>,
			) => AnyPgSQL<
				TableName<keyof TJoins & string> | GetTableName<TTable> | BuildAliasName<TJoinedTable, TAlias>
			>,
			select?: (
				table: BuildAliasTable<TJoinedTable, BuildAliasName<TJoinedTable, TAlias>>,
			) => TSelectedFields,
		) {
			const joinedTableName = joinedTable[tableName] as keyof TAlias & string;
			let aliasIndex = self._alias[joinedTableName];
			if (typeof aliasIndex === 'undefined') {
				self._alias[joinedTableName] = aliasIndex = 1 as TAlias[GetTableName<TJoinedTable>];
			}

			const alias = `${joinedTableName}${aliasIndex}`;
			self._alias[joinedTableName]++;

			const tableAliasProxy = new Proxy(joinedTable, new TableProxyHandler(alias));

			Object.assign(self._joins, { [alias]: tableAliasProxy });

			const onExpression = on(self._joins as any);

			const partialFields = select?.(
				tableAliasProxy as BuildAliasTable<TJoinedTable, BuildAliasName<TJoinedTable, TAlias>>,
			);

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
			| AnyPgSQL<GetTableName<TTable>>,
	): PickWhere<this> {
		if (where instanceof SQL) {
			this.config.where = where;
		} else {
			this.config.where = where(this._joins);
		}
		return this;
	}

	public orderBy(
		orderBy:
			| ((
				joins: TJoins,
			) =>
				| AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>[]
				| AnyPgSQL<TableName<keyof TJoins & string> | GetTableName<TTable>>)
			| (AnyPgSQL<GetTableName<TTable>>[] | AnyPgSQL<GetTableName<TTable>>),
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
