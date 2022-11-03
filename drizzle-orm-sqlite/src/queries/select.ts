import { PreparedQuery, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { SQLiteDialect } from '~/dialect';

import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { SQLiteSession, SQLiteStatement } from '~/session';
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
	limit?: number;
	offset?: number;
	joins: Record<string, JoinsValue>;
	orderBy: SQL[];
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

	limit(limit: number): Omit<this, 'where' | `${JoinType}Join` | 'limit'> {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number): Omit<this, 'where' | `${JoinType}Join` | 'offset'> {
		this.config.offset = offset;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	getQuery(): PreparedQuery {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	prepare(): SQLiteStatement<SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable>> {
		return this.session.prepare(this.getSQL());
	}

	execute(): SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable> {
		const query = this.dialect.buildSelectQuery(this.config);
		const result = this.session.all(query);
		return result.map((row) => mapResultRow(this.config.fields, row, this.joinsNotNullable)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TJoinsNotNullable
		>;
	}
}
