import { AnyMySqlColumn } from '~/mysql-core/columns/common';
import { MySqlDialect } from '~/mysql-core/dialect';
import { MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/mysql-core/session';
import { AnyMySqlTable, GetTableConfig } from '~/mysql-core/table';
import { QueryPromise } from '~/query-promise';
import { Query, SQL, SQLWrapper } from '~/sql';
import {
	GetSubquerySelection,
	Subquery,
	SubqueryConfig,
	SubquerySelectionProxyHandler,
	SubqueryWithSelection,
	WithSubquery,
	WithSubqueryWithSelection,
} from '~/subquery';
import { Table } from '~/table';
import { orderSelectedFields, Simplify } from '~/utils';
import { getTableColumns } from '../utils';

import {
	AnyMySqlSelect,
	BuildSubquerySelection,
	GetSelectTableName,
	JoinFn,
	JoinNullability,
	JoinType,
	LockConfig,
	LockStrength,
	MySqlSelectConfig,
	SelectFields,
	SelectMode,
	SelectResult,
} from './select.types';

export class MySqlSelectBuilder<TSelection extends SelectFields | undefined> {
	constructor(
		private fields: TSelection,
		private session: MySqlSession,
		private dialect: MySqlDialect,
		private withList: Subquery[] = [],
	) {}

	from<TSubquery extends Subquery>(
		subquery: TSubquery,
	): MySqlSelect<
		TSubquery,
		TSelection extends undefined ? GetSubquerySelection<TSubquery> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	>;
	from<TTable extends AnyMySqlTable>(
		table: TTable,
	): MySqlSelect<
		TTable,
		TSelection extends undefined ? GetTableConfig<TTable, 'columns'> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	>;
	from(table: AnyMySqlTable | Subquery): AnyMySqlSelect {
		const isPartialSelect = !!this.fields;

		let fields: SelectFields;
		if (this.fields) {
			fields = this.fields;
		} else if (table instanceof Subquery) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(table[SubqueryConfig].selection).map((
					key,
				) => [key, table[key as unknown as keyof typeof table] as unknown as SelectFields[string]]),
			);
		} else {
			fields = getTableColumns(table, { format: 'object' });
		}

		const fieldsList = orderSelectedFields<AnyMySqlColumn>(fields);
		return new MySqlSelect(table, fields, fieldsList, isPartialSelect, this.session, this.dialect, this.withList);
	}
}

export interface MySqlSelect<
	TTable extends AnyMySqlTable | Subquery,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullability extends Record<string, JoinNullability> = Record<GetSelectTableName<TTable>, 'not-null'>,
> extends QueryPromise<SelectResult<TSelection, TSelectMode, TNullability>[]>, SQLWrapper {}

export class MySqlSelect<
	TTable extends AnyMySqlTable | Subquery,
	// TResult is either a map of columns (partial select) or a map of inferred field types (full select)
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullability extends Record<string, JoinNullability> = Record<GetSelectTableName<TTable>, 'not-null'>,
> extends QueryPromise<SelectResult<TSelection, TSelectMode, TNullability>[]> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $selectMode: TSelectMode;
	declare protected $result: TSelection;

	private config: MySqlSelectConfig;
	private joinsNotNullable: Record<string, boolean>;
	private tableName: string;

	constructor(
		table: MySqlSelectConfig['table'],
		fields: MySqlSelectConfig['fields'],
		fieldsList: MySqlSelectConfig['fieldsList'],
		private isPartialSelect: boolean,
		private session: MySqlSession,
		private dialect: MySqlDialect,
		withList: Subquery[],
	) {
		super();
		this.config = {
			withList,
			table,
			fields,
			fieldsList,
			joins: {},
			orderBy: [],
			groupBy: [],
		};
		this.tableName = table instanceof Subquery ? table[SubqueryConfig].alias : table[Table.Symbol.Name];
		this.joinsNotNullable = { [this.tableName]: true };
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<TTable, TSelectMode, TJoinType, TSelection, TNullability> {
		return (table: AnyMySqlTable | Subquery, on: SQL | undefined): AnyMySqlSelect => {
			const tableName = table instanceof Subquery ? table[SubqueryConfig].alias : table[Table.Symbol.Name];

			if (this.config.joins[tableName]) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullable).length === 1) {
					this.config.fieldsList = this.config.fieldsList.map((field) => ({
						...field,
						path: [this.tableName, ...field.path],
					}));
				}
				this.config.fieldsList.push(
					...orderSelectedFields<AnyMySqlColumn>(
						table instanceof Subquery ? table[SubqueryConfig].selection : table[Table.Symbol.Columns],
						[tableName],
					),
				);
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

	where(where: SQL | undefined): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.where = where;
		return this;
	}

	groupBy(...columns: (AnyMySqlColumn | SQL)[]): Omit<this, 'where' | `${JoinType}Join`> {
		this.config.groupBy = columns as SQL[];
		return this;
	}

	orderBy(...columns: (AnyMySqlColumn | SQL)[]): Omit<this, 'where' | `${JoinType}Join` | 'orderBy'> {
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

	for(strength: LockStrength, config: LockConfig = {}): Omit<this, 'for'> {
		this.config.lockingClause = { strength, config };
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullability>[];
		}
	> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullability>[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.fieldsList, name);
		query.joinsNotNullableMap = this.joinsNotNullable;
		return query;
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullability>[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SubquerySelectionProxyHandler(alias),
		) as SubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias>;
	}

	prepareWithSubquery<TAlias extends string>(
		alias: TAlias,
	): WithSubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias> {
		return new Proxy(
			new WithSubquery(this.getSQL(), this.config.fields, alias, true),
			new SubquerySelectionProxyHandler(alias),
		) as WithSubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias>;
	}
}
