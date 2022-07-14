import { InferType } from 'drizzle-orm/operations';
import { SQL } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgDialect, PgSession } from '~/connection';
import { AnyPgTable } from '~/table';

export interface PgUpdateConfig<TTable extends AnyPgTable> {
	where: SQL<TableName<TTable>>;
	set: SQL<TableName<TTable>>;
	table: TTable;
	returning?: boolean;
}

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected enforceCovariance!: {
		table: TTable;
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

	public set(values: SQL<TableName<TTable>>): Pick<this, 'where' | 'returning' | 'execute'> {
		this.fields.set = values;
		return this;
	}

	public where(where: SQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
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
