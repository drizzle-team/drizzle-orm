import { RunResult } from 'better-sqlite3';
import { PreparedQuery, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';

import { SQLiteDialect, SQLiteSession } from '~/connection';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { AnySQLiteTable, GetTableConfig, InferModel, SQLiteTable } from '~/table';

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	table: AnySQLiteTable;
	returning?: SQLiteSelectFieldsOrdered;
}

export class SQLiteDelete<TTable extends AnySQLiteTable, TReturn = RunResult> implements SQLWrapper {
	private config: SQLiteDeleteConfig;

	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = { table };
	}

	public where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	public returning(): Omit<SQLiteDelete<TTable, InferModel<TTable>[]>, 'where' | 'returning'>;
	public returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'where' | 'returning'>;
	public returning(fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>): SQLiteDelete<TTable, any> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[SQLiteTable.Symbol.Columns],
			this.table[SQLiteTable.Symbol.Name],
		);
		this.config.returning = orderedFields;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	public getQuery(): PreparedQuery {
		return this.dialect.prepareSQL(this.getSQL());
	}

	execute(): TReturn {
		const query = this.dialect.buildDeleteQuery(this.config);
		const { returning } = this.config;
		if (returning) {
			const result = this.session.all(query);
			return result.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		return this.session.run(query) as TReturn;
	}
}
