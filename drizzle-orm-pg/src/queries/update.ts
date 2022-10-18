import { GetColumnData } from 'drizzle-orm';
import { PreparedQuery, SQL } from 'drizzle-orm/sql';
import { mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableConfig, InferModel } from '~/table';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: PgUpdateSet<AnyPgTable>;
	table: AnyPgTable;
	returning?: PgSelectFieldsOrdered;
}

export type PgUpdateSet<TTable extends AnyPgTable> = {
	[Key in keyof GetTableConfig<TTable, 'columns'>]?:
		| GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>
		| SQL;
};

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: PgUpdateConfig;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		this.config = {
			set: undefined!,
			table,
		};
	}

	public set(values: PgUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'getQuery' | 'execute'> {
		this.config.set = values;
		return this;
	}

	public where(where: SQL | undefined): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<PgUpdate<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Pick<PgUpdate<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: PgSelectFields<GetTableConfig<TTable, 'name'>>): PgUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.config.table[tableColumns],
			this.table[tableNameSym],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): PreparedQuery {
		const query = this.dialect.buildUpdateQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;

		if (returning) {
			return result.rows.map((row) => mapResultRow(returning, row)) as unknown as TReturn;
		}
		return result as TReturn;
	}
}
