import { QueryPromise } from 'drizzle-orm/query-promise';
import { Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableConfig, InferModel, PgTable } from '~/table';

export interface PgDeleteConfig {
	where?: SQL | undefined;
	table: AnyPgTable;
	returning?: PgSelectFieldsOrdered;
}

export class PgDelete<TTable extends AnyPgTable, TReturn = QueryResult<any>> extends QueryPromise<TReturn>
	implements SQLWrapper
{
	private config: PgDeleteConfig;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<PgDelete<TTable, InferModel<TTable>[]>, 'where' | 'returning'>;
	returning<TSelectedFields extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<PgDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'where' | 'returning'>;
	returning(fields?: PgSelectFields<GetTableConfig<TTable, 'name'>>): PgDelete<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[PgTable.Symbol.Columns],
			this.table[PgTable.Symbol.Name],
		);
		this.config.returning = orderedFields;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	getQuery(): Query {
		return this.dialect.prepareSQL(this.getSQL());
	}

	protected override async execute(): Promise<TReturn> {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		const { returning } = this.config;
		if (returning) {
			return result.rows.map((row) => mapResultRow(returning, row)) as TReturn;
		}
		return result as TReturn;
	}
}
