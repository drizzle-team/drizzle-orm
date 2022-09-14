import { ColumnData } from 'drizzle-orm/branded-types';
import { AnySQLResponse, Name, SQL, sql } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';

import { Check } from '~/checks';
import { AnySQLiteColumn } from '~/columns/common';
import { AnySQLiteDialect, SQLiteSession } from '~/connection';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { SQLitePreparedQuery } from '~/sql';
import { AnySQLiteTable, GetTableConflictConstraints, InferModel } from '~/table';
import { tableConflictConstraints } from '~/utils';
import { SQLiteUpdateSet } from './update';

export interface SQLiteInsertConfig<TTable extends AnySQLiteTable> {
	table: TTable;
	values: Record<string, ColumnData | SQL<GetTableName<TTable>>>[];
	onConflict: SQL<GetTableName<TTable>> | undefined;
	returning: SQLiteSelectFieldsOrdered<GetTableName<TTable>> | undefined;
}

export type AnySQLiteInsertConfig = SQLiteInsertConfig<AnySQLiteTable>;

export class SQLiteInsert<TTable extends AnySQLiteTable, TReturn = void> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: SQLiteInsertConfig<TTable> = {} as SQLiteInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: InferModel<TTable, 'insert'>[],
		private session: SQLiteSession,
		private dialect: AnySQLiteDialect,
	) {
		this.config.table = table;
		this.config.values = values as SQLiteInsertConfig<TTable>['values'];
	}

	public returning(): Pick<SQLiteInsert<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends SQLiteSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<SQLiteInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: SQLiteSelectFields<GetTableName<TTable>>): SQLiteInsert<TTable, any> {
		const fieldsToMap: Record<string, AnySQLiteColumn<GetTableName<TTable>> | AnySQLResponse<GetTableName<TTable>>> =
			fields
				?? this.config.table[tableColumns] as Record<string, AnySQLiteColumn<GetTableName<TTable>>>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, column, resultTableName: this.config.table[tableName] }),
		);

		return this;
	}

	onConflictDoNothing(
		target?:
			| SQL<GetTableName<TTable>>
			| ((
				constraints: GetTableConflictConstraints<TTable>,
			) => Check<GetTableName<TTable>>),
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		if (typeof target === 'undefined') {
			this.config.onConflict = sql`do nothing`;
		} else if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do nothing`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(
		target:
			| SQL<GetTableName<TTable>>
			| ((constraints: GetTableConflictConstraints<TTable>) => Check<GetTableName<TTable>>),
		set: SQLiteUpdateSet<TTable>,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		const setSql = this.dialect.buildUpdateSet<GetTableName<TTable>>(this.config.table, set);

		if (target instanceof SQL) {
			this.config.onConflict = sql<GetTableName<TTable>>`${target} do update set ${setSql}`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
		}
		return this;
	}

	getQuery(): SQLitePreparedQuery {
		const query = this.dialect.buildInsertQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	execute(): TReturn {
		const query = this.dialect.buildInsertQuery(this.config);
		const { returning } = this.config;
		if (returning) {
			const rows = this.session.all(query);
			return rows.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		this.session.run(query);
		return undefined as TReturn;
	}
}
