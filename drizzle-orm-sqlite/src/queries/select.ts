import { AnyColumn } from 'drizzle-orm';
import { fillPlaceholders, Placeholder, Query, sql, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { SQLiteDialect } from '~/dialect';

import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { PreparedQuery, SQLiteSession } from '~/session';
import { AnySQLiteTable, GetTableConfig, SQLiteTable } from '~/table';

import {
	AnySQLiteSelect,
	AppendToJoinsNotNull,
	AppendToResult,
	JoinNullability,
	JoinsValue,
	JoinType,
	SelectResult,
} from './select.types';

export interface SQLiteSelectConfig {
	fields: SQLiteSelectFieldsOrdered;
	where?: SQL | undefined;
	table: AnySQLiteTable;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: SQL[];
	groupBy: SQL[];
}

export class SQLiteSelect<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $initialSelect: TInitialSelectResultFields;
	declare protected $result: TResult;

	private config: SQLiteSelectConfig;
	private joinsNotNullable: Record<string, boolean>;
	private preparedQuery: PreparedQuery | undefined;

	constructor(
		table: SQLiteSelectConfig['table'],
		fields: SQLiteSelectConfig['fields'],
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
			groupBy: [],
		};
		this.joinsNotNullable = { [table[SQLiteTable.Symbol.Name]]: true };
	}

	private createJoin<TJoinType extends JoinType>(joinType: TJoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnySQLiteTable,
			TSelect extends SQLiteSelectFields<string> = GetTableConfig<TJoinedTable, 'columns'>,
			TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
		>(table: TJoinedTable, on: SQL, select?: TSelect): SQLiteSelect<
			TTable,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, TSelect>,
			AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join(table: AnySQLiteTable, on: SQL, selection?: SQLiteSelectFields<string>): AnySQLiteSelect {
			const tableName = table[SQLiteTable.Symbol.Name];
			self.config.fields.push(
				...self.dialect.orderSelectedFields(selection ?? table[SQLiteTable.Symbol.Columns], tableName),
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
	): Omit<SQLiteSelect<TTable, SelectResultFields<TSelect>, TResult, TJoinsNotNullable>, 'fields'> {
		this.config.fields = this.dialect.orderSelectedFields(fields, this.config.table[SQLiteTable.Symbol.Name]);
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

	groupBy(...columns: AnyColumn[] | SQL[]): Omit<this, 'where' | `${JoinType}Join`> {
		if (columns[0] instanceof SQL) {
			this.config.groupBy = columns as SQL[];
		} else {
			this.config.groupBy = columns.map((column) => sql`${column}`);
		}
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

	prepare(): Omit<this, 'prepare'> {
		if (!this.preparedQuery) {
			this.preparedQuery = this.session.prepareQuery(this.getQuery());
		}
		return this;
	}

	execute(
		placeholderValues?: Record<string, unknown>,
	): SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable> {
		this.prepare();
		const query = this.preparedQuery!;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		const result = this.session.all({ ...query, params });
		return result.map((row) => mapResultRow(this.config.fields, row, this.joinsNotNullable)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TJoinsNotNullable
		>;
	}
}
