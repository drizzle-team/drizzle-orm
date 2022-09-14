import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';

import { AnySQLiteDialect, SQLiteSession } from '~/connection';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { AnySQLiteSQL, SQLitePreparedQuery } from '~/sql';
import { AnySQLiteTable, InferModel } from '~/table';

export interface SQLiteDeleteConfig<TTable extends AnySQLiteTable> {
	where?: AnySQLiteSQL<GetTableName<TTable>> | undefined;
	table: TTable;
	returning?: SQLiteSelectFieldsOrdered;
}

export class SQLiteDelete<TTable extends AnySQLiteTable, TReturn = void> {
	private config: SQLiteDeleteConfig<TTable> = {} as SQLiteDeleteConfig<TTable>;

	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: AnySQLiteDialect,
	) {
		this.config.table = table;
	}

	public where(
		where: AnySQLiteSQL<GetTableName<TTable>> | undefined,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		this.config.where = where;
		return this;
	}

	public returning(): Pick<SQLiteDelete<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends SQLiteSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<SQLiteDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: SQLiteSelectFields<GetTableName<TTable>>): SQLiteDelete<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns],
			this.table[tableName],
		);
		this.config.returning = orderedFields;
		return this;
	}

	public getQuery(): SQLitePreparedQuery {
		const query = this.dialect.buildDeleteQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	public execute(): TReturn {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { returning } = this.config;
		if (returning) {
			const rows = this.session.all(query);
			return rows.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		this.session.run(query);
		return undefined as TReturn;
	}
}
