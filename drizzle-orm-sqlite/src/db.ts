import { Table } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';

import { SQLiteDialect } from '~/dialect';
import {
	SQLiteAsyncDelete,
	SQLiteAsyncInsertBuilder,
	SQLiteAsyncSelect,
	SQLiteAsyncUpdateBuilder,
	SQLiteDelete,
	SQLiteInsertBuilder,
	SQLiteSelect,
	SQLiteSyncDelete,
	SQLiteSyncInsertBuilder,
	SQLiteSyncSelect,
	SQLiteSyncUpdateBuilder,
	SQLiteUpdateBuilder,
} from '~/queries';
import { SQLiteAsyncSession, SQLiteSession, SQLiteSyncSession } from '~/session';
import { AnySQLiteTable, InferModel } from '~/table';

export abstract class BaseSQLiteDatabase<TStatement> {
	constructor(protected dialect: SQLiteDialect, protected session: SQLiteSession<TStatement>) {}

	abstract select<TTable extends AnySQLiteTable>(from: TTable): SQLiteSelect<TTable, InferModel<TTable>, TStatement>;

	abstract update<TTable extends AnySQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TStatement>;

	abstract insert<TTable extends AnySQLiteTable>(table: TTable): SQLiteInsertBuilder<TTable, TStatement>;

	abstract delete<TTable extends AnySQLiteTable>(table: TTable): SQLiteDelete<TTable, TStatement>;
}

export class SQLiteAsyncDatabase<TStatement, TRunResult> extends BaseSQLiteDatabase<TStatement> {
	constructor(dialect: SQLiteDialect, protected override session: SQLiteAsyncSession<TStatement, TRunResult>) {
		super(dialect, session);
	}

	select<TTable extends AnySQLiteTable>(
		from: TTable,
	): SQLiteAsyncSelect<TTable, InferModel<TTable>, TStatement, TRunResult> {
		const table = from;
		const fieldsOrdered = this.dialect.orderSelectedFields(
			table[Table.Symbol.Columns],
			table[Table.Symbol.Name],
		);
		return new SQLiteAsyncSelect(table, fieldsOrdered, this.session, this.dialect);
	}

	update<TTable extends AnySQLiteTable>(table: TTable): SQLiteAsyncUpdateBuilder<TTable, TStatement, TRunResult> {
		return new SQLiteAsyncUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnySQLiteTable>(table: TTable): SQLiteAsyncInsertBuilder<TTable, TStatement, TRunResult> {
		return new SQLiteAsyncInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnySQLiteTable>(table: TTable): SQLiteAsyncDelete<TTable, TStatement, TRunResult> {
		return new SQLiteAsyncDelete(table, this.session, this.dialect);
	}

	run(query: SQL): Promise<TRunResult> {
		return this.session.run(query);
	}

	all<T extends any[] = unknown[]>(query: SQL): Promise<T[]> {
		return this.session.all(query);
	}

	allObjects<T>(query: SQL): Promise<T[]> {
		return this.session.allObjects(query);
	}
}

export class SQLiteSyncDatabase<TStatement, TRunResult> extends BaseSQLiteDatabase<TStatement> {
	constructor(dialect: SQLiteDialect, protected override session: SQLiteSyncSession<TStatement, TRunResult>) {
		super(dialect, session);
	}

	select<TTable extends AnySQLiteTable>(
		from: TTable,
	): SQLiteSyncSelect<TTable, InferModel<TTable>, TStatement, TRunResult> {
		const table = from;
		const fieldsOrdered = this.dialect.orderSelectedFields(
			table[Table.Symbol.Columns],
			table[Table.Symbol.Name],
		);
		return new SQLiteSyncSelect(table, fieldsOrdered, this.session, this.dialect);
	}

	update<TTable extends AnySQLiteTable>(table: TTable): SQLiteSyncUpdateBuilder<TTable, TStatement, TRunResult> {
		return new SQLiteSyncUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnySQLiteTable>(table: TTable): SQLiteSyncInsertBuilder<TTable, TStatement, TRunResult> {
		return new SQLiteSyncInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnySQLiteTable>(table: TTable): SQLiteSyncDelete<TTable, TStatement, TRunResult> {
		return new SQLiteSyncDelete(table, this.session, this.dialect);
	}

	run(query: SQL): TRunResult {
		return this.session.run(query);
	}

	all<T extends any[] = unknown[]>(query: SQL): T[] {
		return this.session.all(query);
	}

	allObjects<T>(query: SQL): T[] {
		return this.session.allObjects(query);
	}
}
