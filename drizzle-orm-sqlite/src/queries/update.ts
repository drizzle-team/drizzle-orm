import { GetColumnData } from 'drizzle-orm';
import { fillPlaceholders, Param, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Simplify } from 'drizzle-orm/utils';
import { SQLiteDialect } from '~/dialect';

import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { PreparedQuery, SQLiteAsyncSession, SQLiteSession, SQLiteSyncSession } from '~/session';
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

export abstract class SQLiteUpdateBuilder<TTable extends AnySQLiteTable, TStatement> {
	declare protected $table: TTable;

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<TStatement>,
		protected dialect: SQLiteDialect,
	) {}

	abstract set(values: SQLiteUpdateSetSource<TTable>): SQLiteUpdate<TTable, TStatement>;
}

export class SQLiteAsyncUpdateBuilder<TTable extends AnySQLiteTable, TStatement, TRunResult>
	extends SQLiteUpdateBuilder<TTable, TStatement>
{
	constructor(
		table: TTable,
		protected override session: SQLiteAsyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, session, dialect);
	}

	set(values: SQLiteUpdateSetSource<TTable>): SQLiteAsyncUpdate<TTable, TStatement, TRunResult> {
		return new SQLiteAsyncUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export class SQLiteSyncUpdateBuilder<TTable extends AnySQLiteTable, TStatement, TRunResult>
	extends SQLiteUpdateBuilder<TTable, TStatement>
{
	constructor(
		table: TTable,
		protected override session: SQLiteSyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, session, dialect);
	}

	set(values: SQLiteUpdateSetSource<TTable>): SQLiteSyncUpdate<TTable, TStatement, TRunResult> {
		return new SQLiteSyncUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export abstract class SQLiteUpdate<TTable extends AnySQLiteTable, TStatement> implements SQLWrapper {
	declare protected $table: TTable;

	protected config: SQLiteUpdateConfig;
	protected preparedQuery: PreparedQuery<TStatement> | undefined;

	constructor(
		table: TTable,
		set: SQLiteUpdateSet,
		protected session: SQLiteSession<TStatement>,
		protected dialect: SQLiteDialect,
	) {
		this.config = { set, table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<SQLiteUpdate<TTable, TStatement>, 'where' | 'returning'>;
	returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteUpdate<TTable, TStatement>, 'where' | 'returning'>;
	returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteUpdate<TTable, TStatement> {
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

export class SQLiteAsyncUpdate<TTable extends AnySQLiteTable, TStatement, TRunResult, TReturn = TRunResult>
	extends SQLiteUpdate<TTable, TStatement>
{
	constructor(
		table: TTable,
		set: SQLiteUpdateSet,
		protected override session: SQLiteAsyncSession<TStatement, TRunResult>,
		protected override dialect: SQLiteDialect,
	) {
		super(table, set, session, dialect);
	}

	override returning(): Omit<
		SQLiteAsyncUpdate<TTable, TStatement, TRunResult, InferModel<TTable>[]>,
		'where' | 'returning'
	>;
	override returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<
		SQLiteAsyncUpdate<TTable, TStatement, TRunResult, SelectResultFields<TSelectedFields>[]>,
		'where' | 'returning'
	>;
	override returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteAsyncUpdate<TTable, TStatement, TRunResult, any> {
		return (fields ? super.returning(fields) : super.returning()) as SQLiteAsyncUpdate<
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

		return this.session.run(query) as TReturn;
	}
}

export class SQLiteSyncUpdate<TTable extends AnySQLiteTable, TStatement, TRunResult, TReturn = TRunResult>
	extends SQLiteUpdate<TTable, TStatement>
{
	constructor(
		table: TTable,
		set: SQLiteUpdateSet,
		protected override session: SQLiteSyncSession<TStatement, TRunResult>,
		protected override dialect: SQLiteDialect,
	) {
		super(table, set, session, dialect);
	}

	override returning(): Omit<
		SQLiteSyncUpdate<TTable, TStatement, TRunResult, InferModel<TTable>[]>,
		'where' | 'returning'
	>;
	override returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<
		SQLiteSyncUpdate<TTable, TStatement, TRunResult, SelectResultFields<TSelectedFields>[]>,
		'where' | 'returning'
	>;
	override returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteSyncUpdate<TTable, TStatement, TRunResult, any> {
		return (fields ? super.returning(fields) : super.returning()) as SQLiteSyncUpdate<
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
