import { GetTableName, tableColumns, tableName, tableRowMapper } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgSQL, PgPreparedQuery } from '~/sql';
import { AnyPgTable, InferModel } from '~/table';

export interface PgDeleteConfig<TTable extends AnyPgTable> {
	where?: AnyPgSQL<GetTableName<TTable>> | undefined;
	table: TTable;
	returning?: PgSelectFieldsOrdered;
}

export class PgDelete<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	private config: PgDeleteConfig<TTable> = {} as PgDeleteConfig<TTable>;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {
		this.config.table = table;
	}

	public where(where: AnyPgSQL<GetTableName<TTable>> | undefined): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<PgDelete<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: PgSelectFields<GetTableName<TTable>>): PgDelete<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns],
			this.table[tableName],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): PgPreparedQuery {
		const query = this.dialect.buildDeleteQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;
		if (returning) {
			return result.rows.map((row) => this.table[tableRowMapper](returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
