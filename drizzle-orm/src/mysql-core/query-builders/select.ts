import { AnyMySqlColumn } from '~/mysql-core/columns/common';
import { MySqlDialect } from '~/mysql-core/dialect';
import { MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/mysql-core/session';
import { AnyMySqlTable, GetTableConfig, InferModel } from '~/mysql-core/table';
import { QueryPromise } from '~/query-promise';
import { Query, SQL, SQLWrapper } from '~/sql';
import { Table } from '~/table';
import { orderSelectedFields } from '~/utils';

import {
	AnyMySqlSelect,
	JoinFn,
	JoinNullability,
	JoinType,
	MySqlSelectConfig,
	SelectFields,
	SelectMode,
	SelectResult,
} from './select.types';

export interface MySqlSelect<
	TTable extends AnyMySqlTable,
	TResult = InferModel<TTable>,
	TSelectMode extends SelectMode = 'single',
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> extends QueryPromise<SelectResult<TResult, TSelectMode, TJoinsNotNullable>[]>, SQLWrapper {}

export class MySqlSelect<
	TTable extends AnyMySqlTable,
	// TResult is either a map of columns (partial select) or a map of inferred field types (full select)
	TResult = InferModel<TTable>,
	TSelectMode extends SelectMode = 'single',
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> extends QueryPromise<SelectResult<TResult, TSelectMode, TJoinsNotNullable>[]> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $selectMode: TSelectMode;
	declare protected $result: TResult;

	private config: MySqlSelectConfig;
	private isPartialSelect = false;
	private joinsNotNullable: Record<string, boolean>;

	constructor(
		table: MySqlSelectConfig['table'],
		fields: MySqlSelectConfig['fields'],
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
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
	): JoinFn<TTable, TSelectMode, TJoinType, TResult, TJoinsNotNullable> {
		return (table: AnyMySqlTable, on: SQL): AnyMySqlSelect => {
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

	fields<TSelect extends SelectFields>(
		fields: TSelect,
	): Omit<MySqlSelect<TTable, TSelect, 'partial', TJoinsNotNullable>, 'fields'> {
		this.config.fields = orderSelectedFields(fields);
		this.isPartialSelect = true;
		return this as AnyMySqlSelect;
	}

	where(where: SQL | undefined): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.where = where;
		return this;
	}

	groupBy(...columns: (AnyMySqlColumn | SQL)[]): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.groupBy = columns as SQL[];
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

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TResult, TSelectMode, TJoinsNotNullable>[];
		}
	> {
		return this.session.prepareQuery(this.toSQL(), this.config.fields, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TResult, TSelectMode, TJoinsNotNullable>[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
