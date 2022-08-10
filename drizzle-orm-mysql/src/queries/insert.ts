import { ColumnData } from 'drizzle-orm/branded-types';
import { AnySQLResponse, Name, SQL, sql } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';
import { Check } from '~/checks';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlDialect, MySqlQueryResult, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, GetTableConflictConstraints, InferModel } from '~/table';
import { tableConflictConstraints } from '~/utils';
import { MySqlUpdateSet } from './update';
export interface MySqlInsertConfig<TTable extends AnyMySqlTable> {
	table: TTable;
	values: Record<string, ColumnData | SQL<GetTableName<TTable>>>[];
	onConflict: SQL<GetTableName<TTable>> | undefined;
	returning: MySqlSelectFieldsOrdered<GetTableName<TTable>> | undefined;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<AnyMySqlTable>;

export class MySqlInsert<TTable extends AnyMySqlTable, TReturn = MySqlQueryResult> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: MySqlInsertConfig<TTable> = {} as MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: InferModel<TTable, 'insert'>[],
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
	) {
		this.config.table = table;
		this.config.values = values as MySqlInsertConfig<TTable>['values'];
	}

	public returning(): Pick<MySqlInsert<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends MySqlSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<MySqlInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: MySqlSelectFields<GetTableName<TTable>>): MySqlInsert<TTable, any> {
		const fieldsToMap: Record<string, AnyMySqlColumn<GetTableName<TTable>> | AnySQLResponse<GetTableName<TTable>>> =
			fields
				?? this.config.table[tableColumns] as Record<string, AnyMySqlColumn<GetTableName<TTable>>>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, column, resultTableName: this.config.table[tableName] }),
		);

		return this;
	}

	onDuplicateDoNothing(
		target?:
			| SQL<GetTableName<TTable>>
			| ((
				constraints: GetTableConflictConstraints<TTable>,
			) => Check<GetTableName<TTable>>),
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		if (typeof target === 'undefined') {
			this.config.onConflict = sql`do nothing`;
		} else if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do nothing`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
		}
		return this;
	}

	onDuplicateDoUpdate(
		target:
			| SQL<GetTableName<TTable>>
			| ((constraints: GetTableConflictConstraints<TTable>) => Check<GetTableName<TTable>>),
		set: MySqlUpdateSet<TTable>,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		const setSql = this.dialect.buildUpdateSet<GetTableName<TTable>>(this.config.table, set);

		if (target instanceof SQL) {
			this.config.onConflict = sql<GetTableName<TTable>>`${target} do update set ${setSql}`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
		}
		return this;
	}

	getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildInsertQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	async execute(): Promise<TReturn> {
		const query = this.dialect.buildInsertQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		const { returning } = this.config;
		if (returning) {
			return result[0].map((row: any) => mapResultRow(returning, row)) as TReturn;
		} else {
			return result as TReturn;
		}
	}
}
