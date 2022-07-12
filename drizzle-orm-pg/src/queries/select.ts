import { InferType } from 'drizzle-orm';
import { AnyPgDialect } from 'drizzle-orm-pg/connection';
import { AnyPgSession } from 'drizzle-orm-pg/operations';
import { AnyPgTable } from 'drizzle-orm-pg/table';
import { SelectConfig, SelectFields } from 'drizzle-orm/operations';
import { SQL } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

export interface PgSelectConfig<TTable extends string> extends SelectConfig<AnyPgTable> {}

export type AnyPgSelectConfig = SelectConfig<AnyPgTable>;

export class PgSelect<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	private config: SelectConfig<TTable> = {} as SelectConfig<TTable>;

	constructor(
		private table: TTable,
		private fields: SelectFields<TableName<TTable>> | undefined,
		private session: AnyPgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.config.fields = fields;
		this.config.table = table;
	}

	public where(where: SQL<TableName<TTable>>): Pick<this, 'execute'> {
		this.config.where = where;
		return this;
	}

	public execute(): Promise<TReturn> {
		const query = this.dialect.buildSelectQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		return this.session.query(sql, params).then((result) => {
			return this.mapper(result.rows) as unknown as TReturn;
		});
	}
}
