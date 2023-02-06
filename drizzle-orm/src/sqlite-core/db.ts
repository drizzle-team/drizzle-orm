import { SQLWrapper } from '~/sql';
import { Table } from '~/table';

import { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { SQLiteDelete, SQLiteInsertBuilder, SQLiteSelect, SQLiteUpdateBuilder } from '~/sqlite-core/query-builders';
import { ResultKind, SQLiteSession } from '~/sqlite-core/session';
import { AnySQLiteTable } from '~/sqlite-core/table';
import { orderSelectedFields } from '~/utils';

export class BaseSQLiteDatabase<TResultType extends 'sync' | 'async', TRunResult> {
	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		/** @internal */
		readonly session: SQLiteSession<TResultType, TRunResult>,
	) {}

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

	run(query: SQLWrapper): ResultKind<TResultType, TRunResult> {
		return this.session.run(query.getSQL());
	}

	all<T extends any = unknown>(query: SQLWrapper): ResultKind<TResultType, T[]> {
		return this.session.all(query.getSQL());
	}

	get<T extends any = unknown>(query: SQLWrapper): ResultKind<TResultType, T> {
		return this.session.get(query.getSQL());
	}

	values<T extends any[] = unknown[]>(query: SQLWrapper): ResultKind<TResultType, T[]> {
		return this.session.values(query.getSQL());
	}
}
