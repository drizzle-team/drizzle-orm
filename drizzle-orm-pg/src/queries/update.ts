import { InferColumnType } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgDriverParam, PgSession } from '~/connection';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType, TableColumns } from '~/table';

export interface PgUpdateConfig<TTable extends AnyPgTable> {
	where: AnyPgSQL<TableName<TTable>>;
	set: PgUpdateSet<TTable>;
	table: TTable;
	returning?: boolean;
}

export type PgUpdateSet<TTable extends AnyPgTable> = {
	[Key in keyof TableColumns<TTable>]?:
		| InferColumnType<TableColumns<TTable>[Key], 'query'>
		| SQL<TableName<TTable>, PgDriverParam>;
};

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected enforceCovariance!: {
		table: TTable;
		return: TReturn;
	};

	private fields: PgUpdateConfig<TTable> = {} as PgUpdateConfig<TTable>;

	constructor(
		private table: TTable,
		private session: PgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.fields.table = table;
	}

	public set(values: PgUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'execute'> {
		this.fields.set = values;
		return this;
	}

	public where(where: AnyPgSQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
		this.fields.where = where;
		return this;
	}

	public returning(): Pick<PgUpdate<TTable, InferType<TTable>>, 'execute'> {
		this.fields.returning = true;
		return this as unknown as Pick<PgUpdate<TTable, InferType<TTable>>, 'execute'>;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.fields);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.mapper(result.rows) as unknown as TReturn;
	}
}
