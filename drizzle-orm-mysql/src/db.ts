import { SQLWrapper } from 'drizzle-orm/sql';
import { ResultSetHeader } from 'mysql2/promise';
import { MySqlDialect } from './dialect';
import { MySqlDelete, MySqlInsertBuilder, MySqlSelect, MySqlUpdateBuilder } from './query-builders';
import { MySqlQueryResult, MySqlSession } from './session';
import { AnyMySqlTable, MySqlTable } from './table';
import { orderSelectedFields } from './utils';

export class MySqlDatabase {
	constructor(private dialect: MySqlDialect, private session: MySqlSession) {}

	select<TTable extends AnyMySqlTable>(from: TTable): MySqlSelect<TTable> {
		const fields = orderSelectedFields(from[MySqlTable.Symbol.Columns]);
		return new MySqlSelect(from, fields, this.session, this.dialect);
	}

	update<TTable extends AnyMySqlTable>(table: TTable): MySqlUpdateBuilder<TTable> {
		return new MySqlUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyMySqlTable>(table: TTable): MySqlInsertBuilder<TTable> {
		return new MySqlInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyMySqlTable>(table: TTable): MySqlDelete<TTable> {
		return new MySqlDelete(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = ResultSetHeader>(query: SQLWrapper): Promise<MySqlQueryResult<T>> {
		return this.session.execute(query.getSQL());
	}
}
