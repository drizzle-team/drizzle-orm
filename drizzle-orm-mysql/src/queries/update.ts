import { GetColumnData } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlDialect, MySqlQueryResult, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyMySQL, MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, GetTableColumns, InferModel } from '~/table';

export interface MySqlUpdateConfig<TTable extends AnyMySqlTable> {
	where?: AnyMySQL<GetTableName<TTable>> | undefined;
	set: MySqlUpdateSet<TTable>;
	table: TTable;
	returning?: MySqlSelectFieldsOrdered<GetTableName<TTable>>;
}

export type MySqlUpdateSet<TTable extends AnyMySqlTable> = {
	[Key in keyof GetTableColumns<TTable>]?:
		| GetColumnData<GetTableColumns<TTable>[Key], 'query'>
		| SQL<GetTableName<TTable>>;
};

export class MySqlUpdate<TTable extends AnyMySqlTable, TReturn = MySqlQueryResult> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: MySqlUpdateConfig<TTable>;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
	) {
		this.config = {
			table,
		} as MySqlUpdateConfig<TTable>;
	}

	public set(values: MySqlUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'getQuery' | 'execute'> {
		this.config.set = values;
		return this;
	}

	public where(where: AnyMySQL<GetTableName<TTable>> | undefined): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<MySqlUpdate<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends MySqlSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<MySqlUpdate<TTable, SelectResultFields<GetTableName<TTable>, TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: MySqlSelectFields<GetTableName<TTable>>): MySqlUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields<GetTableName<TTable>>(
			fields
				?? (this.config.table[tableColumns] as Record<string, AnyMySqlColumn<GetTableName<TTable>>>),
			this.table[tableName],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildUpdateQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);

		if (this.config.returning) {
			return mapResultRow(this.config.returning, result[0]) as unknown as TReturn;
		}
		return result as TReturn;
	}
}
