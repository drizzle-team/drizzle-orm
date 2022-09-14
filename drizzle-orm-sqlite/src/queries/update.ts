import { GetColumnData } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';
import { AnySQLiteColumn } from '~/columns/common';

import { AnySQLiteDialect, SQLiteSession } from '~/connection';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { AnySQLiteSQL, SQLitePreparedQuery } from '~/sql';
import { AnySQLiteTable, GetTableColumns, InferModel } from '~/table';

export interface SQLiteUpdateConfig<TTable extends AnySQLiteTable> {
	where?: AnySQLiteSQL<GetTableName<TTable>> | undefined;
	set: SQLiteUpdateSet<TTable>;
	table: TTable;
	returning?: SQLiteSelectFieldsOrdered<GetTableName<TTable>>;
}

export type SQLiteUpdateSet<TTable extends AnySQLiteTable> = {
	[Key in keyof GetTableColumns<TTable>]?:
		| GetColumnData<GetTableColumns<TTable>[Key], 'query'>
		| SQL<GetTableName<TTable>>;
};

export class SQLiteUpdate<TTable extends AnySQLiteTable, TReturn = void> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: SQLiteUpdateConfig<TTable>;

	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: AnySQLiteDialect,
	) {
		this.config = {
			table,
		} as SQLiteUpdateConfig<TTable>;
	}

	public set(values: SQLiteUpdateSet<TTable>): Pick<this, 'where' | 'returning' | 'getQuery' | 'execute'> {
		this.config.set = values;
		return this;
	}

	public where(
		where: AnySQLiteSQL<GetTableName<TTable>> | undefined,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<SQLiteUpdate<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends SQLiteSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<SQLiteUpdate<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: SQLiteSelectFields<GetTableName<TTable>>): SQLiteUpdate<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields<GetTableName<TTable>>(
			fields
				?? (this.config.table[tableColumns] as Record<string, AnySQLiteColumn<GetTableName<TTable>>>),
			this.table[tableName],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): SQLitePreparedQuery {
		const query = this.dialect.buildUpdateQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public execute(): TReturn {
		const query = this.dialect.buildUpdateQuery(this.config);
		const { returning } = this.config;
		if (returning) {
			const rows = this.session.all(query);
			return rows.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		this.session.run(query);
		return undefined as TReturn;
	}
}
