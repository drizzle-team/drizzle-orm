import { RunResult } from 'better-sqlite3';
import { fillPlaceholders, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { SQLiteDialect } from '~/dialect';

import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { PreparedQuery, SQLiteSession } from '~/session';
import { AnySQLiteTable, GetTableConfig, InferModel, SQLiteTable } from '~/table';

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	table: AnySQLiteTable;
	returning?: SQLiteSelectFieldsOrdered;
}

export class SQLiteDelete<TTable extends AnySQLiteTable, TReturn = RunResult> implements SQLWrapper {
	private config: SQLiteDeleteConfig;
	private preparedQuery: PreparedQuery | undefined;

	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = { table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<SQLiteDelete<TTable, InferModel<TTable>[]>, 'where' | 'returning'>;
	returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteDelete<TTable, SelectResultFields<TSelectedFields>[]>, 'where' | 'returning'>;
	returning(fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>): SQLiteDelete<TTable, any> {
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

	getQuery(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	prepare(): Omit<this, 'prepare'> {
		if (!this.preparedQuery) {
			this.preparedQuery = this.session.prepareQuery(this.getQuery());
		}
		return this;
	}

	execute(placeholderValues?: Record<string, unknown>): TReturn {
		this.prepare();
		let query = this.preparedQuery!;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		query = { ...query, params };

		const { returning } = this.config;
		if (returning) {
			const result = this.session.all(query);
			return result.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		return this.session.run(query) as TReturn;
	}
}
