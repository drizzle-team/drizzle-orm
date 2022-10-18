import { PreparedQuery, SQL } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { InferModel, PgTable } from '~/table';

export interface PgDeleteConfig {
	where?: SQL | undefined;
	table: PgTable;
	returning?: PgSelectFieldsOrdered;
}

export class PgDelete<TTable extends PgTable, TReturn = QueryResult<any>> {
	private config: PgDeleteConfig;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		this.config = { table };
	}

	public where(where: SQL | undefined): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<PgDelete<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Pick<PgDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: PgSelectFields<GetTableConfig<TTable, 'name'>>): PgDelete<TTable, any> {
		const a = this.table[tableColumns];
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns],
			this.table[tableNameSym],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): PreparedQuery {
		const query = this.dialect.buildDeleteQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;
		if (returning) {
			return result.rows.map((row) => mapResultRow(returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
