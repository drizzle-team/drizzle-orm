import { Table } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';

import { SQLiteDialect } from '~/dialect';
import { SQLiteDelete, SQLiteInsertBuilder, SQLiteSelect, SQLiteUpdateBuilder } from '~/query-builders';
import { ResultKind, SQLiteSession } from '~/session';
import { AnySQLiteTable } from '~/table';
import { orderSelectedFields } from './utils';

export class BaseSQLiteDatabase<TResultType extends 'sync' | 'async', TRunResult> {
	constructor(protected dialect: SQLiteDialect, protected session: SQLiteSession<TResultType, TRunResult>) {}

	select<TTable extends AnySQLiteTable>(from: TTable): SQLiteSelect<TTable, TResultType, TRunResult> {
		const fields = orderSelectedFields(from[Table.Symbol.Columns]);
		return new SQLiteSelect(from, fields, this.session, this.dialect);
	}

	update<TTable extends AnySQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TResultType, TRunResult> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnySQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, TResultType, TRunResult> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect);
	}

	delete<TTable extends AnySQLiteTable>(from: TTable): SQLiteDelete<TTable, TResultType, TRunResult> {
		return new SQLiteDelete(from, this.session, this.dialect);
	}

	run(query: SQL): ResultKind<TResultType, TRunResult> {
		return this.session.run(query);
	}

	all<T extends any = unknown>(query: SQL): ResultKind<TResultType, T[]> {
		return this.session.all(query);
	}

	get<T extends any = unknown>(query: SQL): ResultKind<TResultType, T> {
		return this.session.get(query);
	}

	values<T extends any[] = unknown[]>(query: SQL): ResultKind<TResultType, T[]> {
		return this.session.values(query);
	}
}
