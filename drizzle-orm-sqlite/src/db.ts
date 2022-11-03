import { RunResult } from 'better-sqlite3';
import { SQL } from 'drizzle-orm/sql';

import { SQLiteDialect } from '~/dialect';
import { SQLiteDelete, SQLiteInsertBuilder, SQLiteSelect, SQLiteUpdateBuilder } from '~/queries';
import { SQLiteSession } from '~/session';
import { AnySQLiteTable, InferModel, SQLiteTable } from '~/table';

export class SQLiteDatabase {
	constructor(private dialect: SQLiteDialect, private session: SQLiteSession) {}

	select<TTable extends AnySQLiteTable>(from: TTable): SQLiteSelect<TTable, InferModel<TTable>> {
		const table = from;
		const fieldsOrdered = this.dialect.orderSelectedFields(
			table[SQLiteTable.Symbol.Columns],
			table[SQLiteTable.Symbol.Name],
		);
		return new SQLiteSelect(table, fieldsOrdered, this.session, this.dialect);
	}

	update<TTable extends AnySQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnySQLiteTable>(table: TTable): SQLiteInsertBuilder<TTable> {
		return new SQLiteInsertBuilder(
			table,
			this.session,
			this.dialect,
		);
	}

	delete<TTable extends AnySQLiteTable>(table: TTable): SQLiteDelete<TTable> {
		return new SQLiteDelete(table, this.session, this.dialect);
	}

	run(query: SQL): RunResult {
		return this.session.run(query);
	}

	all<T extends any[] = unknown[]>(query: SQL): T[] {
		return this.session.all(query);
	}

	allObjects<T>(query: SQL): T[] {
		return this.session.allObjects(query);
	}
}
