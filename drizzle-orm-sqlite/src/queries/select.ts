import { Table } from 'drizzle-orm';
import { fillPlaceholders, Placeholder, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { SQLiteDialect } from '~/dialect';

import { SelectResultFields, SQLiteSelectFields } from '~/operations';
import { PreparedQuery, SQLiteAsyncSession, SQLiteSession, SQLiteSyncSession } from '~/session';
import { AnySQLiteTable, GetTableConfig } from '~/table';
import { Statement } from './common';

import {
	AnySQLiteSelect,
	AsyncJoinFn,
	JoinFn,
	JoinNullability,
	JoinType,
	SelectResult,
	SQLiteSelectConfig,
	SyncJoinFn,
} from './select.types';

export abstract class SQLiteSelect<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TStatement,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $initialSelect: TInitialSelectResultFields;
	declare protected $result: TResult;

	protected config: SQLiteSelectConfig;
	protected joinsNotNullable: Record<string, boolean>;

	constructor(
		table: SQLiteSelectConfig['table'],
		fields: SQLiteSelectConfig['fields'],
		protected session: SQLiteSession<TStatement>,
		protected dialect: SQLiteDialect,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
		this.joinsNotNullable = { [table[Table.Symbol.Name]]: true };
	}

	protected createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<TTable, TInitialSelectResultFields, TStatement, TJoinType, TResult, TJoinsNotNullable> {
		const self = this;

		function join(table: AnySQLiteTable, on: SQL, selection?: SQLiteSelectFields<string>): AnySQLiteSelect {
			const tableName = table[Table.Symbol.Name];
			self.config.fields.push(
				...self.dialect.orderSelectedFields(selection ?? table[Table.Symbol.Columns], tableName),
			);

			self.config.joins[tableName] = {
				on,
				table,
				joinType,
			};

			switch (joinType) {
				case 'left':
					self.joinsNotNullable[tableName] = false;
					break;
				case 'right':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, false]),
					);
					self.joinsNotNullable[tableName] = true;
					break;
				case 'inner':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, true]),
					);
					self.joinsNotNullable[tableName] = true;
					break;
				case 'full':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, false]),
					);
					self.joinsNotNullable[tableName] = false;
					break;
			}

			return self;
		}

		return join;
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	fields<TSelect extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelect,
	): Omit<SQLiteSelect<TTable, SelectResultFields<TSelect>, TStatement, TResult, TJoinsNotNullable>, 'fields'> {
		this.config.fields = this.dialect.orderSelectedFields(fields, this.config.table[Table.Symbol.Name]);
		return this as any;
	}

	where(where: SQL | undefined): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.where = where;
		return this;
	}

	orderBy(...columns: SQL[]): Omit<this, 'where' | `${JoinType}Join` | 'orderBy'> {
		this.config.orderBy = columns;
		return this;
	}

	limit(limit: number | Placeholder): Omit<this, 'where' | `${JoinType}Join` | 'limit'> {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number | Placeholder): Omit<this, 'where' | `${JoinType}Join` | 'offset'> {
		this.config.offset = offset;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	getQuery(): Query {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.sqlToQuery(query);
	}

	prepare(): Statement<unknown> {
		const query = this.session.prepareQuery(this.getQuery());
		return new Statement(query, (params) => this.executePreparedQuery(query, params));
	}

	protected abstract executePreparedQuery(query: PreparedQuery, placeholderValues?: Record<string, unknown>): unknown;

	execute(placeholderValues?: Record<string, unknown>): unknown {
		const stmt = this.prepare();
		const result = stmt.execute(placeholderValues);
		stmt.finalize();
		return result;
	}
}

export class SQLiteAsyncSelect<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TStatement,
	TRunResult,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> extends SQLiteSelect<TTable, TInitialSelectResultFields, TStatement, TResult, TJoinsNotNullable> {
	constructor(
		table: SQLiteSelectConfig['table'],
		fields: SQLiteSelectConfig['fields'],
		protected override session: SQLiteAsyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, fields, session, dialect);
	}

	protected override createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): AsyncJoinFn<TTable, TInitialSelectResultFields, TStatement, TRunResult, TJoinType, TResult, TJoinsNotNullable> {
		return super.createJoin(joinType) as AsyncJoinFn<
			TTable,
			TInitialSelectResultFields,
			TStatement,
			TRunResult,
			TJoinType,
			TResult,
			TJoinsNotNullable
		>;
	}

	override leftJoin = this.createJoin('left');

	override rightJoin = this.createJoin('right');

	override innerJoin = this.createJoin('inner');

	override fullJoin = this.createJoin('full');

	override fields<TSelect extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelect,
	): Omit<
		SQLiteAsyncSelect<TTable, SelectResultFields<TSelect>, TStatement, TRunResult, TResult, TJoinsNotNullable>,
		'fields'
	> {
		return super.fields(fields) as Omit<
			SQLiteAsyncSelect<TTable, SelectResultFields<TSelect>, TStatement, TRunResult, TResult, TJoinsNotNullable>,
			'fields'
		>;
	}

	protected async executePreparedQuery(
		query: PreparedQuery<TStatement>,
		placeholderValues?: Record<string, unknown>,
	): Promise<unknown> {
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		const result = await this.session.all({ ...query, params });
		return result.map((row) => mapResultRow(this.config.fields, row, this.joinsNotNullable));
	}

	override execute(
		placeholderValues?: Record<string, unknown>,
	): Promise<SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable>> {
		return super.execute(placeholderValues) as Promise<
			SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable>
		>;
	}
}

export class SQLiteSyncSelect<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TStatement,
	TRunResult,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> extends SQLiteSelect<TTable, TInitialSelectResultFields, TStatement, TResult, TJoinsNotNullable> {
	constructor(
		table: SQLiteSelectConfig['table'],
		fields: SQLiteSelectConfig['fields'],
		protected override session: SQLiteSyncSession<TStatement, TRunResult>,
		dialect: SQLiteDialect,
	) {
		super(table, fields, session, dialect);
	}

	protected override createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): SyncJoinFn<TTable, TInitialSelectResultFields, TStatement, TRunResult, TJoinType, TResult, TJoinsNotNullable> {
		return super.createJoin(joinType) as SyncJoinFn<
			TTable,
			TInitialSelectResultFields,
			TStatement,
			TRunResult,
			TJoinType,
			TResult,
			TJoinsNotNullable
		>;
	}

	override leftJoin = this.createJoin('left');

	override rightJoin = this.createJoin('right');

	override innerJoin = this.createJoin('inner');

	override fullJoin = this.createJoin('full');

	override fields<TSelect extends SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelect,
	): Omit<
		SQLiteSyncSelect<TTable, SelectResultFields<TSelect>, TStatement, TRunResult, TResult, TJoinsNotNullable>,
		'fields'
	> {
		return super.fields(fields) as Omit<
			SQLiteSyncSelect<TTable, SelectResultFields<TSelect>, TStatement, TRunResult, TResult, TJoinsNotNullable>,
			'fields'
		>;
	}

	protected executePreparedQuery(
		query: PreparedQuery<TStatement>,
		placeholderValues?: Record<string, unknown>,
	): unknown {
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		const result = this.session.all({ ...query, params });
		return result.map((row) => mapResultRow(this.config.fields, row, this.joinsNotNullable));
	}

	override execute(
		placeholderValues?: Record<string, unknown>,
	): SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable> {
		return super.execute(placeholderValues) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TJoinsNotNullable
		>;
	}
}
