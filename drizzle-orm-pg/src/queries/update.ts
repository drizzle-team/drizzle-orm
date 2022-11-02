import { GetColumnData } from 'drizzle-orm';
import { Param, PreparedQuery, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Simplify } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableConfig, InferModel, PgTable } from '~/table';
import { mapUpdateSet } from '~/utils';
import { QueryPromise } from './common';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: PgUpdateSet;
	table: AnyPgTable;
	returning?: PgSelectFieldsOrdered;
}

export type PgUpdateSetSource<TTable extends AnyPgTable> = Simplify<
	{
		[Key in keyof GetTableConfig<TTable, 'columns'>]?:
			| GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>
			| SQL;
	}
>;

export type PgUpdateSet = Record<string, SQL | Param | null | undefined>;

export class PgUpdateBuilder<TTable extends AnyPgTable> {
	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	set(values: PgUpdateSetSource<TTable>): PgUpdate<TTable> {
		return new PgUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> extends QueryPromise<TReturn>
	implements SQLWrapper
{
	declare protected $table: TTable;
	declare protected $return: TReturn;

	private config: PgUpdateConfig;

	constructor(
		table: TTable,
		set: PgUpdateSet,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { set, table };
	}

	public where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	public returning(): Omit<PgUpdate<TTable, InferModel<TTable>[]>, 'where' | 'returning'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<PgUpdate<TTable, SelectResultFields<TSelectedFields>[]>, 'where' | 'returning'>;
	public returning(fields?: PgSelectFields<GetTableConfig<TTable, 'name'>>): PgUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.config.table[PgTable.Symbol.Columns],
			this.config.table[PgTable.Symbol.Name],
		);
		this.config.returning = orderedFields;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	public getQuery(): PreparedQuery {
		return this.dialect.prepareSQL(this.getSQL());
	}

	protected override async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;

		if (returning) {
			return result.rows.map((row) => mapResultRow(returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
