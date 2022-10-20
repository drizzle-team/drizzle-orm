import { SQL } from 'drizzle-orm/sql';
import { QueryResult, QueryResultRow } from 'pg';

import { AnyPgTable, InferModel, PgDialect, PgSession, PgTable } from '.';
import { PgDelete, PgInsertBuilder, PgSelect, PgUpdateBuilder } from './queries';

export class PgDatabase {
	constructor(private dialect: PgDialect, private session: PgSession) {}

	select<TTable extends AnyPgTable>(from: TTable): PgSelect<TTable, InferModel<TTable>> {
		const table = from;
		const fieldsOrdered = this.dialect.orderSelectedFields(table[PgTable.Symbol.Columns], table[PgTable.Symbol.Name]);
		return new PgSelect(table, fieldsOrdered, this.session, this.dialect);
	}

	update<TTable extends AnyPgTable>(table: TTable): PgUpdateBuilder<TTable> {
		return new PgUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyPgTable>(table: TTable): PgInsertBuilder<TTable> {
		return new PgInsertBuilder(
			table,
			this.session,
			this.dialect,
		);
	}

	delete<TTable extends AnyPgTable>(table: TTable): PgDelete<TTable> {
		return new PgDelete(table, this.session, this.dialect);
	}

	execute<T extends QueryResultRow = QueryResultRow>(query: SQL): Promise<QueryResult<T>> {
		const { sql, params } = this.dialect.prepareSQL(query);
		return this.session.query(sql, params);
	}
}
