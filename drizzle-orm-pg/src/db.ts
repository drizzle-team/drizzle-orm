import { SQL } from 'drizzle-orm/sql';
import { tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { QueryResult, QueryResultRow } from 'pg';

import { AnyPgTable, InferModel, PgDialect, PgSession } from '.';
import { PgDelete, PgInsert, PgSelect, PgUpdate } from './queries';

export class PGDatabase {
	constructor(private dialect: PgDialect, private session: PgSession) {}

	select<TTable extends AnyPgTable>(from: TTable): PgSelect<TTable, InferModel<TTable>> {
		const table = from;
		const fieldsOrdered = this.dialect.orderSelectedFields(
			table[tableColumns],
			table[tableNameSym],
		);
		return new PgSelect(table, fieldsOrdered, this.session, this.dialect);
	}

	update<TTable extends AnyPgTable>(table: TTable): Pick<PgUpdate<TTable>, 'set'> {
		return new PgUpdate(table, this.session, this.dialect);
	}

	insert<TTable extends AnyPgTable>(table: TTable): PgInsert<TTable> {
		return new PgInsert(
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
