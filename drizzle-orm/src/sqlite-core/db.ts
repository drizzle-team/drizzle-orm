import { SQLWrapper } from '~/sql';

import { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import {
	SQLiteDelete,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders';
import { ResultKind, SQLiteSession } from '~/sqlite-core/session';
import { AnySQLiteTable } from '~/sqlite-core/table';
import { SelectFields } from './query-builders/select.types';

export class BaseSQLiteDatabase<TResultType extends 'sync' | 'async', TRunResult> {
	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		/** @internal */
		readonly session: SQLiteSession<TResultType, TRunResult>,
	) {}

	select(): SQLiteSelectBuilder<undefined, TResultType, TRunResult>;
	select<TSelection extends SelectFields>(fields: TSelection): SQLiteSelectBuilder<TSelection, TResultType, TRunResult>;
	select(fields?: SelectFields): SQLiteSelectBuilder<SelectFields | undefined, TResultType, TRunResult> {
		return new SQLiteSelectBuilder(fields ?? undefined, this.session, this.dialect);
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
