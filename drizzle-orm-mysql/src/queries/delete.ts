import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';
import { AnyMySqlDialect, MySqlQueryResult, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyMySQL, MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, InferModel } from '~/table';

export interface MySqlDeleteConfig<TTable extends AnyMySqlTable> {
	where?: AnyMySQL<GetTableName<TTable>> | undefined;
	table: TTable;
	returning?: MySqlSelectFieldsOrdered;
}

export class MySqlDelete<TTable extends AnyMySqlTable, TReturn = MySqlQueryResult> {
	private config: MySqlDeleteConfig<TTable> = {} as MySqlDeleteConfig<TTable>;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
	) {
		this.config.table = table;
	}

	public where(where: AnyMySQL<GetTableName<TTable>> | undefined): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<MySqlDelete<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends MySqlSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<MySqlDelete<TTable, SelectResultFields<GetTableName<TTable>, TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: MySqlSelectFields<GetTableName<TTable>>): MySqlDelete<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns],
			this.table[tableName],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildDeleteQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;
		if (returning) {
			return result[0].map((row: any) => mapResultRow(returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
