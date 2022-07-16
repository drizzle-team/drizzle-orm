import { SQL } from 'drizzle-orm/sql';
import { tableName, TableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgSession } from '~/connection';
import { AnyPgTable, InferType } from '~/table';

export interface PgDeleteConfig<TTable extends AnyPgTable> {
	where: SQL<TableName<TTable>>;
	table: TTable;
	returning?: boolean;
}

export class PgDelete<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	private fields: PgDeleteConfig<TTable> = {} as PgDeleteConfig<TTable>;

	constructor(
		private table: TTable,
		private session: PgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.fields.table = table;
	}

	public where(where: SQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
		this.fields.where = where;
		return this;
	}

	public returning(): Pick<PgDelete<TTable, InferType<TTable>>, 'execute'> {
		this.fields.returning = true;
		return this as unknown as Pick<PgDelete<TTable, InferType<TTable>>, 'execute'>;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.fields);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.mapper(result.rows) as unknown as TReturn;
	}
}
