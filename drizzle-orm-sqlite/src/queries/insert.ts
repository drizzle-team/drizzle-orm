import { Table } from 'drizzle-orm';
import { fillPlaceholders, Param, Placeholder, Query, SQL, sql, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Simplify } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from '~/columns/common';
import { SQLiteDialect } from '~/dialect';
import { IndexColumn } from '~/indexes';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { PreparedQuery, SQLiteAsyncSession, SQLiteSession, SQLiteSyncSession } from '~/session';
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

export abstract class SQLiteInsertBuilder<TTable extends AnySQLiteTable, TStatement> {
	constructor(
		protected table: TTable,
		protected session: SQLiteSession<TStatement>,
		protected dialect: SQLiteDialect,
	) {}

	protected mapValues(values: SQLiteInsertValue<TTable>[]): Record<string, Param<unknown, unknown> | SQL>[] {
		return values.map((entry) => {
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
	}

	abstract values(...values: SQLiteInsertValue<TTable>[]): SQLiteInsert<TTable, TStatement>;
}

export class SQLiteAsyncInsertBuilder<TTable extends AnySQLiteTable, TStatement, TRunResult>
	extends SQLiteInsertBuilder<TTable, TStatement>
{
	constructor(
		table: TTable,
		protected override session: SQLiteAsyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, session, dialect);
	}

	override values(...values: SQLiteInsertValue<TTable>[]): SQLiteAsyncInsert<TTable, TStatement, TRunResult> {
		return new SQLiteAsyncInsert(this.table, this.mapValues(values), this.session, this.dialect);
	}
}

export class SQLiteSyncInsertBuilder<TTable extends AnySQLiteTable, TStatement, TRunResult>
	extends SQLiteInsertBuilder<TTable, TStatement>
{
	constructor(
		table: TTable,
		protected override session: SQLiteSyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, session, dialect);
	}

	override values(...values: SQLiteInsertValue<TTable>[]): SQLiteSyncInsert<TTable, TStatement, TRunResult> {
		return new SQLiteSyncInsert(this.table, this.mapValues(values), this.session, this.dialect);
	}
}

export abstract class SQLiteInsert<TTable extends AnySQLiteTable, TStatement> implements SQLWrapper {
	declare protected $table: TTable;

	protected config: SQLiteInsertConfig<TTable>;
	protected preparedQuery: PreparedQuery<TStatement> | undefined;

	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		protected session: SQLiteSession<TStatement>,
		protected dialect: SQLiteDialect,
	) {
		this.config = { table, values };
	}

	returning(): Omit<SQLiteInsert<TTable, TStatement>, 'returning' | `onConflict${string}`>;
	returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteInsert<TTable, TStatement>, 'returning' | `onConflict${string}`>;
	returning(fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>): SQLiteInsert<TTable, TStatement> {
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
}

export class SQLiteAsyncInsert<TTable extends AnySQLiteTable, TStatement, TRunResult, TReturn = TRunResult>
	extends SQLiteInsert<TTable, TStatement>
{
	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		protected override session: SQLiteAsyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, values, session, dialect);
	}

	override returning(): Omit<
		SQLiteAsyncInsert<TTable, TStatement, TRunResult, InferModel<TTable>[]>,
		'returning' | `onConflict${string}`
	>;
	override returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<
		SQLiteAsyncInsert<TTable, TStatement, TRunResult, SelectResultFields<TSelectedFields>[]>,
		'returning' | `onConflict${string}`
	>;
	override returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteAsyncInsert<TTable, TStatement, TRunResult, any> {
		return (fields ? super.returning(fields) : super.returning()) as SQLiteAsyncInsert<
			TTable,
			TStatement,
			TRunResult,
			any
		>;
	}

	async execute(placeholderValues?: Record<string, unknown>): Promise<TReturn> {
		this.prepare();
		let query = this.preparedQuery!;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		query = { ...query, params };

		const { returning } = this.config;
		if (returning) {
			const result = await this.session.all(query);
			return result.map((row) => mapResultRow(returning, row)) as TReturn;
		}

		return this.session.run(query) as unknown as Promise<TReturn>;
	}
}

export class SQLiteSyncInsert<TTable extends AnySQLiteTable, TStatement, TRunResult, TReturn = TRunResult>
	extends SQLiteInsert<TTable, TStatement>
{
	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		protected override session: SQLiteSyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, values, session, dialect);
	}

	override returning(): Omit<
		SQLiteSyncInsert<TTable, TStatement, TRunResult, InferModel<TTable>[]>,
		'returning' | `onConflict${string}`
	>;
	override returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<
		SQLiteSyncInsert<TTable, TStatement, TRunResult, SelectResultFields<TSelectedFields>[]>,
		'returning' | `onConflict${string}`
	>;
	override returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteSyncInsert<TTable, TStatement, TRunResult, any> {
		return (fields ? super.returning(fields) : super.returning()) as SQLiteSyncInsert<
			TTable,
			TStatement,
			TRunResult,
			any
		>;
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

		return this.session.run(query) as unknown as TReturn;
	}
}
