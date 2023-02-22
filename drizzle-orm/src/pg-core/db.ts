import { PgDialect } from '~/pg-core/dialect';
import { PgDelete, PgInsertBuilder, PgSelectBuilder, PgUpdateBuilder } from '~/pg-core/query-builders';
import { PgSession, QueryResultHKT, QueryResultKind } from '~/pg-core/session';
import { AnyPgTable } from '~/pg-core/table';
import { SQLWrapper } from '~/sql';
import { WithSubquery } from '~/subquery';
import { SelectFields } from './query-builders/select.types';

export class PgDatabase<TQueryResult extends QueryResultHKT, TSession extends PgSession> {
	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: TSession,
	) {}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): PgSelectBuilder<undefined>;
		function select<TSelection extends SelectFields>(fields: TSelection): PgSelectBuilder<TSelection>;
		function select(fields?: SelectFields): PgSelectBuilder<SelectFields | undefined> {
			return new PgSelectBuilder(fields ?? undefined, self.session, self.dialect, queries);
		}

		return { select };
	}

	select(): PgSelectBuilder<undefined>;
	select<TSelection extends SelectFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	select(fields?: SelectFields): PgSelectBuilder<SelectFields | undefined> {
		return new PgSelectBuilder(fields ?? undefined, this.session, this.dialect);
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
