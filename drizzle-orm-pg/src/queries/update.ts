import { GetColumnData } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';
import { AnyPgColumn } from '~/columns/common';

import { AnyPgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgSQL, PgPreparedQuery } from '~/sql';
import { AnyPgTable, GetTableColumns, InferModel } from '~/table';

export interface PgUpdateConfig<TTable extends AnyPgTable> {
	where?: AnyPgSQL<GetTableName<TTable>> | undefined;
	set: PgUpdateSet<TTable>;
	table: TTable;
	returning?: PgSelectFieldsOrdered<GetTableName<TTable>>;
}

export type PgUpdateSet<TTable extends AnyPgTable> = {
	[Key in keyof GetTableColumns<TTable>]?:
		| GetColumnData<GetTableColumns<TTable>[Key], 'query'>
		| SQL<GetTableName<TTable>>;
};

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected typeKeeper!: {
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

	public set(values: PgUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'getQuery' | 'execute'> {
		this.config.set = values;
		return this;
	}

	public where(where: AnyPgSQL<GetTableName<TTable>> | undefined): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<PgUpdate<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgUpdate<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: PgSelectFields<GetTableName<TTable>>): PgUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields<GetTableName<TTable>>(
			fields
				?? (this.config.table[tableColumns] as Record<string, AnyPgColumn<GetTableName<TTable>>>),
			this.table[tableName],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): PgPreparedQuery {
		const query = this.dialect.buildUpdateQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);

		if (this.config.returning) {
			return mapResultRow(this.config.returning, result.rows) as unknown as TReturn;
		}
		return result as TReturn;
	}
}
