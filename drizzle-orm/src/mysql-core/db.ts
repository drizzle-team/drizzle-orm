import { ResultSetHeader } from 'mysql2/promise';
import { SQLWrapper } from '~/sql';
import { MySqlDialect } from './dialect';
import { MySqlDelete, MySqlInsertBuilder, MySqlSelectBuilder, MySqlUpdateBuilder } from './query-builders';
import { SelectFields } from './query-builders/select.types';
import { MySqlSession, QueryResultHKT, QueryResultKind } from './session';
import { AnyMySqlTable } from './table';

export class MySqlDatabase<TQueryResult extends QueryResultHKT, TSession extends MySqlSession> {
	constructor(
		/** @internal */
		readonly dialect: MySqlDialect,
		/** @internal */
		readonly session: TSession,
	) {}

	select(): MySqlSelectBuilder<undefined>;
	select<TSelection extends SelectFields>(fields: TSelection): MySqlSelectBuilder<TSelection>;
	select(fields?: SelectFields): MySqlSelectBuilder<SelectFields | undefined> {
		return new MySqlSelectBuilder(fields ?? undefined, this.session, this.dialect);
	}

	update<TTable extends AnyMySqlTable>(table: TTable): MySqlUpdateBuilder<TTable, TQueryResult> {
		return new MySqlUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyMySqlTable>(table: TTable): MySqlInsertBuilder<TTable, TQueryResult> {
		return new MySqlInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyMySqlTable>(table: TTable): MySqlDelete<TTable, TQueryResult> {
		return new MySqlDelete(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = ResultSetHeader>(
		query: SQLWrapper,
	): Promise<QueryResultKind<TQueryResult, T>> {
		return this.session.execute(query.getSQL());
	}
}
