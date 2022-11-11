import { GetTableName, mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { AnyMySqlDialect, MySqlQueryResult, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyMySQL, MySQL, MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, InferModel } from '~/table';

export interface MySqlDeleteConfig {
	where?: AnyMySQL | undefined;
	table: AnyMySqlTable;
	returning?: MySqlSelectFieldsOrdered;
}

export class MySqlDelete<TTable extends AnyMySqlTable, TReturn = MySqlQueryResult> {
	private config: MySqlDeleteConfig;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
	) {
		this.config = { table };
	}

	where(
		where: MySQL<GetTableConfig<TTable, 'name'>> | undefined,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	returning(): Pick<MySqlDelete<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	returning<TSelectedFields extends MySqlSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Pick<MySqlDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	returning(fields?: MySqlSelectFields<GetTableConfig<TTable, 'name'>>): MySqlDelete<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns],
			this.table[tableNameSym],
		);
		this.config.returning = orderedFields;
		return this;
	}

	getQuery(): MySqlPreparedQuery {
		const query = this.dialect.buildDeleteQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;
		if (returning) {
			return result[0].map((row: any[]) => mapResultRow(returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
