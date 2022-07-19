import { tableColumns, TableName, tableRowMapper } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgSession } from '~/connection';
import { PartialSelectResult, PgSelectFields, PgSelectFieldsOrdered } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType } from '~/table';

export interface PgDeleteConfig<TTable extends AnyPgTable> {
	where: AnyPgSQL<TableName<TTable>>;
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

	public where(where: AnyPgSQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<PgDelete<TTable, InferType<TTable>[]>, 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<TableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgDelete<TTable, PartialSelectResult<TableName<TTable>, TSelectedFields>[]>, 'execute'>;
	public returning(fields?: PgSelectFields<TableName<TTable>>): Pick<PgDelete<TTable, any>, 'execute'> {
		const orderedFields = this.dialect.orderSelectedFields(fields ?? this.table[tableColumns]);
		this.config.returning = orderedFields;
		return this;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;
		if (returning) {
			return result.rows.map((row) => this.table[tableRowMapper](returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
