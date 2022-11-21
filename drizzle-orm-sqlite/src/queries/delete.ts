import { fillPlaceholders, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { SQLiteDialect } from '~/dialect';

import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { PreparedQuery, SQLiteAsyncSession, SQLiteSession, SQLiteSyncSession } from '~/session';
import { AnySQLiteTable, GetTableConfig, InferModel, SQLiteTable } from '~/table';

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	table: AnySQLiteTable;
	returning?: SQLiteSelectFieldsOrdered;
}

export abstract class SQLiteDelete<TTable extends AnySQLiteTable, TStatement> implements SQLWrapper {
	protected config: SQLiteDeleteConfig;
	protected preparedQuery: PreparedQuery<TStatement> | undefined;

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<TStatement>,
		protected dialect: SQLiteDialect,
	) {
		this.config = { table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<SQLiteDelete<TTable, TStatement>, 'where' | 'returning'>;
	returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<SQLiteDelete<TTable, TStatement>, 'where' | 'returning'>;
	returning(fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>): SQLiteDelete<TTable, TStatement> {
		const orderedFields = this.dialect.orderSelectedFields(
			fields ?? this.table[SQLiteTable.Symbol.Columns],
			this.table[SQLiteTable.Symbol.Name],
		);
		this.config.returning = orderedFields;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	prepare(): Omit<this, 'prepare'> {
		if (!this.preparedQuery) {
			this.preparedQuery = this.session.prepareQuery(this.toSQL());
		}
		return this;
	}
}

export class SQLiteAsyncDelete<TTable extends AnySQLiteTable, TStatement, TRunResult, TReturn = TRunResult>
	extends SQLiteDelete<TTable, TStatement>
{
	constructor(
		table: TTable,
		protected override session: SQLiteAsyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, session, dialect);
	}

	override returning(): Omit<
		SQLiteAsyncDelete<TTable, TStatement, TRunResult, InferModel<TTable>[]>,
		'where' | 'returning'
	>;
	override returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<
		SQLiteAsyncDelete<TTable, TStatement, TRunResult, SelectResultFields<TSelectedFields>[]>,
		'where' | 'returning'
	>;
	override returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteAsyncDelete<TTable, TStatement, TRunResult, any> {
		return (fields ? super.returning(fields) : super.returning()) as SQLiteAsyncDelete<
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

export class SQLiteSyncDelete<TTable extends AnySQLiteTable, TStatement, TRunResult, TReturn = TRunResult>
	extends SQLiteDelete<TTable, TStatement>
{
	constructor(
		table: TTable,
		protected override session: SQLiteSyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, session, dialect);
	}

	override returning(): Omit<
		SQLiteSyncDelete<TTable, TStatement, TRunResult, InferModel<TTable>[]>,
		'where' | 'returning'
	>;
	override returning<TSelectedFields extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<
		SQLiteSyncDelete<TTable, TStatement, TRunResult, SelectResultFields<TSelectedFields>[]>,
		'where' | 'returning'
	>;
	override returning(
		fields?: SQLiteSelectFields<GetTableConfig<TTable, 'name'>>,
	): SQLiteSyncDelete<TTable, TStatement, TRunResult, any> {
		return (fields ? super.returning(fields) : super.returning()) as SQLiteSyncDelete<
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
