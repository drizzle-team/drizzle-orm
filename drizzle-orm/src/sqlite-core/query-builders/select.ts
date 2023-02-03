import { Placeholder, Query, SQL, SQLWrapper } from '~/sql';
import { AnySQLiteColumn } from '~/sqlite-core/columns';
import { SQLiteDialect } from '~/sqlite-core/dialect';
import { Table } from '~/table';

import { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import { AnySQLiteTable, GetTableConfig, InferModel } from '~/sqlite-core/table';

import { orderSelectedFields } from '~/utils';
import {
	AnySQLiteSelect,
	JoinFn,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
	SQLiteSelectConfig,
	SQLiteSelectFields,
} from './select.types';

export interface SQLiteSelect<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TResult = InferModel<TTable>,
	TSelectMode extends SelectMode = 'single',
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> extends SQLWrapper {}

export class SQLiteSelect<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	// TResult is either a map of columns (partial select) or a map of inferred field types (full select)
	TResult = InferModel<TTable>,
	TSelectMode extends SelectMode = 'single',
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $selectMode: TSelectMode;
	declare protected $result: TResult;

	private config: SQLiteSelectConfig;
	private isPartialSelect = false;
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
			groupBy: [],
		};
		this.joinsNotNullable = { [table[Table.Symbol.Name]]: true };
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<TTable, TRunResult, TResultType, TSelectMode, TJoinType, TResult, TJoinsNotNullable> {
		return (table: AnySQLiteTable, on: SQL): AnySQLiteSelect => {
			const tableName = table[Table.Symbol.Name];

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullable).length === 1) {
					this.config.fields = this.config.fields.map((field) => ({
						...field,
						path: [this.config.table[Table.Symbol.Name], ...field.path],
					}));
				}
				this.config.fields.push(...orderSelectedFields(table[Table.Symbol.Columns], [tableName]));
			}

			this.config.joins[tableName] = { on, table, joinType };

			switch (joinType) {
				case 'left':
					this.joinsNotNullable[tableName] = false;
					break;
				case 'right':
					this.joinsNotNullable = Object.fromEntries(
						Object.entries(this.joinsNotNullable).map(([key]) => [key, false]),
					);
					this.joinsNotNullable[tableName] = true;
					break;
				case 'inner':
					this.joinsNotNullable[tableName] = true;
					break;
				case 'full':
					this.joinsNotNullable = Object.fromEntries(
						Object.entries(this.joinsNotNullable).map(([key]) => [key, false]),
					);
					this.joinsNotNullable[tableName] = false;
					break;
			}

			return this;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	fields<TSelect extends SQLiteSelectFields>(
		fields: TSelect,
	): Omit<
		SQLiteSelect<TTable, TResultType, TRunResult, TSelect, 'partial', TJoinsNotNullable>,
		'fields'
	> {
		this.config.fields = orderSelectedFields(fields);
		this.isPartialSelect = true;
		return this;
	}

	where(where: SQL | undefined): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.where = where;
		return this;
	}

	orderBy(...columns: SQL[]): Omit<this, 'where' | `${JoinType}Join` | 'orderBy'> {
		this.config.orderBy = columns;
		return this;
	}

	groupBy(...columns: (AnySQLiteColumn | SQL)[]): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.groupBy = columns;
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

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest} = this.dialect.sqlToQuery(this.getSQL());
		return rest
	}

	prepare(): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: SelectResult<TResult, TSelectMode, TJoinsNotNullable>[];
			get: SelectResult<TResult, TSelectMode, TJoinsNotNullable>;
			values: any[][];
		}
	> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.fields);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare().values(placeholderValues);
	};
}
