import { RunResult } from 'better-sqlite3';
import { Table } from 'drizzle-orm';
import { fillPlaceholders, Name, Param, Placeholder, Query, SQL, sql, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Simplify } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from '~/columns/common';
import { SQLiteDialect } from '~/dialect';
import { IndexColumn } from '~/indexes';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { PreparedQuery, SQLiteSession } from '~/session';
import { AnySQLiteTable, GetTableConfig, InferModel, SQLiteTable } from '~/table';
import { mapUpdateSet } from '~/utils';
import { SQLiteUpdateSetSource } from './update';

export interface SQLiteInsertConfig<TTable extends AnySQLiteTable = AnySQLiteTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SQLiteSelectFieldsOrdered;
}

export type SQLiteInsertValue<TTable extends AnySQLiteTable> = Simplify<
	{
		[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
	}
>;

export class SQLiteInsertBuilder<TTable extends AnySQLiteTable> {
	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {}

	values(...values: SQLiteInsertValue<TTable>[]): SQLiteInsert<TTable> {
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				if (colValue instanceof SQL) {
					result[colKey] = colValue;
				} else {
					result[colKey] = new Param(colValue, cols[colKey]);
				}
			}
			return result;
		});

		return new SQLiteInsert(this.table, mappedValues, this.session, this.dialect);
	}
}

export class SQLiteInsert<TTable extends AnySQLiteTable, TReturn = RunResult> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $return: TReturn;

	private config: SQLiteInsertConfig<TTable>;
	private preparedQuery: PreparedQuery | undefined;

	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = { table, values };
	}

	returning(): Omit<SQLiteInsert<TTable, InferModel<TTable>[]>, 'returning' | `onConflict${string}`>;
	returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'returning' | `onConflict${string}`>;
	returning(fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>): SQLiteInsert<TTable, any> {
		const fieldsToMap: SQLiteSelectFields<GetTableConfig<TTable, 'name'>> = fields
			?? this.config.table[SQLiteTable.Symbol.Columns] as Record<
				string,
				AnySQLiteColumn<{ tableName: GetTableConfig<TTable, 'name'> }>
			>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, field: column, resultTableName: this.config.table[SQLiteTable.Symbol.Name] }),
		);

		return this;
	}

	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict = sql`${config.target}${whereSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(config: {
		target?: IndexColumn | IndexColumn[];
		where?: SQL;
		set: SQLiteUpdateSetSource<TTable>;
	}): this {
		const whereSql = config.where ? sql` where ${config.where}` : sql``;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`${config.target}${whereSql} do update set ${setSql}`;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
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
