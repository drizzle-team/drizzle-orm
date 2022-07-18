import { TableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgSession } from '~/connection';
import { PartialSelectResult, PgSelectFields } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType } from '~/table';

export interface PgDeleteConfig<TTable extends AnyPgTable> {
	where: AnyPgSQL<TableName<TTable>>;
	table: TTable;
	returning?: boolean;
	returningFields?: PgSelectFields<TableName<TTable>> | undefined;
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

	public where(where: AnyPgSQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
		this.fields.where = where;
		return this;
	}

	public returning(): Pick<PgDelete<TTable, InferType<TTable>[]>, 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<TableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgDelete<TTable, PartialSelectResult<TableName<TTable>, TSelectedFields>[]>, 'execute'>;
	public returning(fields?: any): Pick<PgDelete<TTable, any>, 'execute'> {
		if (fields) {
			this.fields.returningFields = fields;
		}
		this.fields.returning = true;
		return this;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.fields);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.mapper(result.rows) as unknown as TReturn;
	}
}
