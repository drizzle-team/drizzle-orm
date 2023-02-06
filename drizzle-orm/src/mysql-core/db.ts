import { ResultSetHeader } from 'mysql2/promise';
import { SQLWrapper } from '~/sql';
import { orderSelectedFields } from '~/utils';
import { MySqlDialect } from './dialect';
import { MySqlDelete, MySqlInsertBuilder, MySqlSelect, MySqlUpdateBuilder } from './query-builders';
import { MySqlSession, QueryResultHKT, QueryResultKind } from './session';
import { AnyMySqlTable, MySqlTable } from './table';

export class MySqlDatabase<TQueryResult extends QueryResultHKT, TSession extends MySqlSession> {
	constructor(
		/** @internal */
		readonly dialect: MySqlDialect,
		/** @internal */
		readonly session: TSession,
	) {}

	select<TTable extends AnyMySqlTable>(from: TTable): MySqlSelect<TTable> {
		const fields = orderSelectedFields(from[MySqlTable.Symbol.Columns]);
		return new MySqlSelect(from, fields, this.session, this.dialect);
	}

	update<TTable extends AnyMySqlTable>(table: TTable): MySqlUpdateBuilder<TTable,TQueryResult> {
		return new MySqlUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyMySqlTable>(table: TTable): MySqlInsertBuilder<TTable,TQueryResult> {
		return new MySqlInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyMySqlTable>(table: TTable): MySqlDelete<TTable, TQueryResult> {
		return new MySqlDelete(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = ResultSetHeader>(query: SQLWrapper): Promise<QueryResultKind<TQueryResult, T>> {
		return this.session.execute(query.getSQL());
	}
}
