import { InferColumnType } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableRowMapper } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgDriverParam, PgSession } from '~/connection';
import { PartialSelectResult, PgSelectFields, PgSelectFieldsOrdered } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType, TableColumns } from '~/table';

export interface PgUpdateConfig<TTable extends AnyPgTable> {
	where?: AnyPgSQL<TableName<TTable>>;
	set: PgUpdateSet<TTable>;
	table: TTable;
	returning?: PgSelectFieldsOrdered;
}

export type PgUpdateSet<TTable extends AnyPgTable> = {
	[Key in keyof TableColumns<TTable>]?:
		| InferColumnType<TableColumns<TTable>[Key], 'query'>
		| SQL<TableName<TTable>>;
};

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected enforceCovariance!: {
		table: TTable;
		return: TReturn;
	};

	private config: PgUpdateConfig<TTable>;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {
		this.config = {
			table,
		} as PgUpdateConfig<TTable>;
	}

	public set(values: PgUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'execute'> {
		this.config.set = values;
		return this;
	}

	public where(where: AnyPgSQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<PgUpdate<TTable, InferType<TTable>[]>, 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<TableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgUpdate<TTable, PartialSelectResult<TableName<TTable>, TSelectedFields>[]>, 'execute'>;
	public returning(fields?: PgSelectFields<TableName<TTable>>): Pick<PgUpdate<TTable, any>, 'execute'> {
		const orderedFields = this.dialect.orderSelectedFields(fields ?? this.config.table[tableColumns]);
		this.config.returning = orderedFields;
		return this;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);

		if (this.config.returning) {
			return this.table[tableRowMapper](result.rows, this.config.returning) as unknown as TReturn;
		}
		return result as TReturn;
	}
}
