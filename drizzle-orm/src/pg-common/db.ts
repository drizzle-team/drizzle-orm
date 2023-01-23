import { SQLWrapper } from 'drizzle-orm/sql';
import { PgDialect } from '~/dialect';
import { PgDelete, PgInsertBuilder, PgSelect, PgUpdateBuilder } from '~/query-builders';
import { PgSession, QueryResultHKT, QueryResultKind } from '~/session';
import { AnyPgTable, PgTable } from '~/table';
import { orderSelectedFields } from '~/utils';

export class PgDatabase<TQueryResult extends QueryResultHKT, TSession extends PgSession> {
	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: TSession,
	) {}

	select<TTable extends AnyPgTable>(from: TTable): PgSelect<TTable> {
		const fields = orderSelectedFields(from[PgTable.Symbol.Columns]);
		return new PgSelect(from, fields, this.session, this.dialect);
	}

	update<TTable extends AnyPgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult> {
		return new PgUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyPgTable>(table: TTable): PgInsertBuilder<TTable, TQueryResult> {
		return new PgInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyPgTable>(table: TTable): PgDelete<TTable, TQueryResult> {
		return new PgDelete(table, this.session, this.dialect);
	}

	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper,
	): Promise<QueryResultKind<TQueryResult, TRow>> {
		return this.session.execute(query.getSQL());
	}
}
