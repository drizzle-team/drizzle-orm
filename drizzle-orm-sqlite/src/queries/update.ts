import { RunResult } from 'better-sqlite3';
import { GetColumnData } from 'drizzle-orm';
import { Param, PreparedQuery, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { SQLiteDialect, SQLiteSession } from '~/connection';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { AnySQLiteTable, GetTableConfig, InferModel, SQLiteTable } from '~/table';
import { mapUpdateSet } from '~/utils';

export interface SQLiteUpdateConfig {
	where?: SQL | undefined;
	set: SQLiteUpdateSet;
	table: AnySQLiteTable;
	returning?: SQLiteSelectFieldsOrdered;
}

export type SQLiteUpdateSetSource<TTable extends AnySQLiteTable> = Simplify<
	{
		[Key in keyof GetTableConfig<TTable, 'columns'>]?:
			| GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>
			| SQL;
	}
>;

export type SQLiteUpdateSet = Record<string, SQL | Param | null | undefined>;

export class SQLiteUpdateBuilder<TTable extends AnySQLiteTable> {
	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {}

	set(values: SQLiteUpdateSetSource<TTable>): SQLiteUpdate<TTable> {
		return new SQLiteUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export class SQLiteUpdate<TTable extends AnySQLiteTable, TReturn = RunResult> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $return: TReturn;

	private config: SQLiteUpdateConfig;

	constructor(
		table: TTable,
		set: SQLiteUpdateSet,
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = { set, table };
	}

	public where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	public returning(): Omit<SQLiteUpdate<TTable, InferModel<TTable>[]>, 'where' | 'returning'>;
	public returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteUpdate<TTable, SelectResultFields<TSelectedFields>[]>, 'where' | 'returning'>;
	public returning(fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>): SQLiteUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.config.table[SQLiteTable.Symbol.Columns],
			this.config.table[SQLiteTable.Symbol.Name],
		);
		this.config.returning = orderedFields;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	public getQuery(): PreparedQuery {
		return this.dialect.prepareSQL(this.getSQL());
	}

	execute(): TReturn {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { returning } = this.config;

		if (returning) {
			const result = this.session.all(query);
			return result.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		return this.session.run(query) as TReturn;
	}
}
