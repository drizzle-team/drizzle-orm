import { SQLWrapper } from 'drizzle-orm/sql';
import { QueryResult, QueryResultRow } from 'pg';

import { PgDialect } from '~/dialect';
import { PgDelete, PgInsertBuilder, PgSelect, PgUpdateBuilder } from '~/query-builders';
import { PgSession } from '~/session';
import { AnyPgTable, PgTable } from '~/table';
import { orderSelectedFields } from '~/utils';

export class PgDatabase {
	constructor(private dialect: PgDialect, private session: PgSession) {}

	select<TTable extends AnyPgTable>(from: TTable): PgSelect<TTable> {
		const fields = orderSelectedFields(from[PgTable.Symbol.Columns]);
		return new PgSelect(from, fields, this.session, this.dialect);
	}

	update<TTable extends AnyPgTable>(table: TTable): PgUpdateBuilder<TTable> {
		return new PgUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyPgTable>(table: TTable): PgInsertBuilder<TTable> {
		return new PgInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyPgTable>(table: TTable): PgDelete<TTable> {
		return new PgDelete(table, this.session, this.dialect);
	}

	execute<T extends QueryResultRow = QueryResultRow>(query: SQLWrapper): Promise<QueryResult<T>> {
		return this.session.execute(query.getSQL());
	}
}
