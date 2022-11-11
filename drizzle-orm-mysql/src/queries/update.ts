import { GetColumnData } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlDialect, MySqlQueryResult, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyMySQL, MySQL, MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, GetTableColumns, InferModel } from '~/table';

export interface MySqlUpdateConfig {
	where?: AnyMySQL | undefined;
	set: MySqlUpdateSet<AnyMySqlTable>;
	table: AnyMySqlTable;
	returning?: MySqlSelectFieldsOrdered;
}

export type MySqlUpdateSet<TTable extends AnyMySqlTable> = {
	[Key in keyof GetTableConfig<TTable, 'columns'>]?:
		| GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>
		| SQL<GetTableConfig<TTable, 'name'>>;
};

export class MySqlUpdate<TTable extends AnyMySqlTable, TReturn = MySqlQueryResult> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: MySqlUpdateConfig;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
	) {
		this.config = {
			set: {},
			table,
		};
	}

	set(values: MySqlUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'getQuery' | 'execute'> {
		this.config.set = values;
		return this;
	}

	where(
		where: MySQL<GetTableConfig<TTable, 'name'>> | undefined,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	returning(): Pick<MySqlUpdate<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	returning<TSelectedFields extends MySqlSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Pick<MySqlUpdate<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	returning(fields?: MySqlSelectFields<GetTableConfig<TTable, 'name'>>): MySqlUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields<GetTableConfig<TTable, 'name'>>(
			fields
				?? (this.config.table[tableColumns] as Record<string, AnyMySqlColumn<GetTableConfig<TTable, 'name'>>>),
			this.table[tableNameSym],
		);
		this.config.returning = orderedFields;
		return this;
	}

	getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildUpdateQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;

		if (returning) {
			return result[0].map((row: any[]) => mapResultRow(returning, row)) as unknown as TReturn;
		}
		return result as TReturn;
	}
}
