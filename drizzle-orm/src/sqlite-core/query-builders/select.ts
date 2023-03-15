import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql';
import type { AnySQLiteColumn } from '~/sqlite-core/columns';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
import { Table } from '~/table';

import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';

import type { SubqueryWithSelection } from '~/sqlite-core/subquery';
import { SelectionProxyHandler, Subquery, SubqueryConfig } from '~/subquery';
import { orderSelectedFields, type Simplify, type ValueOrArray } from '~/utils';
import { ViewBaseConfig } from '~/view';
import { getTableColumns } from '../utils';
import { SQLiteViewBase } from '../view';
import { QueryBuilder } from './query-builder';
import type {
	AnySQLiteSelect,
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinFn,
	JoinNullability,
	JoinType,
	SelectFields,
	SelectMode,
	SelectResult,
	SQLiteSelectConfig,
	SQLiteSelectWithFilteredMethods,
} from './select.types';

type CreateSQLiteSelectFromBuilderMode<TSelect, TBuilderMode extends 'db' | 'qb'> = TBuilderMode extends 'db' ? TSelect
	: SQLiteSelectWithFilteredMethods<
		TSelect,
		'prepare' | 'run' | 'all' | 'get' | 'values'
	>;

export class SQLiteSelectBuilder<
	TSelection extends SelectFields | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	constructor(
		private fields: TSelection,
		private session: SQLiteSession | undefined,
		private dialect: SQLiteDialect,
		private withList: Subquery[] = [],
	) {}

	from<TFrom extends AnySQLiteTable | Subquery | SQLiteViewBase>(
		source: TFrom,
	): CreateSQLiteSelectFromBuilderMode<
		SQLiteSelect<
			GetSelectTableName<TFrom>,
			TResultType,
			TRunResult,
			TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
			TSelection extends undefined ? 'single' : 'partial'
		>,
		TBuilderMode
	>;
	from(
		source: AnySQLiteTable | Subquery | SQLiteViewBase,
	): SQLiteSelectWithFilteredMethods<AnySQLiteSelect, 'prepare' | 'execute'> {
		const isPartialSelect = !!this.fields;

		let fields: SelectFields;
		if (this.fields) {
			fields = this.fields;
		} else if (source instanceof Subquery) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source[SubqueryConfig].selection).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectFields[string]]),
			);
		} else if (source instanceof SQLiteViewBase) {
			fields = source[ViewBaseConfig].selection as SelectFields;
		} else {
			fields = getTableColumns(source);
		}

		const fieldsList = orderSelectedFields<AnySQLiteColumn>(fields);
		return new SQLiteSelect(source, fields, fieldsList, isPartialSelect, this.session, this.dialect, this.withList);
	}
}

export abstract class SQLiteSelectCore<
	TTableName extends string,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTableName, 'not-null'>,
> extends QueryBuilder<BuildSubquerySelection<TSelection, TNullabilityMap>> {
	declare protected $selectMode: TSelectMode;
	declare protected $selection: TSelection;
	declare protected $subquerySelection: BuildSubquerySelection<TSelection, TNullabilityMap>;
}

export interface SQLiteSelect<
	TTableName extends string,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TExcludedMethods extends string = never,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTableName, 'not-null'>,
> extends SQLiteSelectCore<TTableName, TSelection, TSelectMode, TNullabilityMap> {}

export class SQLiteSelect<
	TTableName extends string,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TExcludedMethods extends string = never,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTableName, 'not-null'>,
> extends SQLiteSelectCore<TTableName, TSelection, TSelectMode, TNullabilityMap> {
	private config: SQLiteSelectConfig;
	private joinsNotNullableMap: Record<string, boolean>;
	private tableName: string;

	constructor(
		table: SQLiteSelectConfig['table'],
		fields: SQLiteSelectConfig['fields'],
		fieldsList: SQLiteSelectConfig['fieldsList'],
		private isPartialSelect: boolean,
		private session: SQLiteSession | undefined,
		private dialect: SQLiteDialect,
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
		this.$subquerySelection = fields as BuildSubquerySelection<TSelection, TNullabilityMap>;
		this.tableName = table instanceof Subquery
			? table[SubqueryConfig].alias
			: table instanceof SQLiteViewBase
			? table[ViewBaseConfig].name
			: table[Table.Symbol.Name];
		this.joinsNotNullableMap = { [this.tableName]: true };
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<
		TTableName,
		TResultType,
		TRunResult,
		TSelectMode,
		TJoinType,
		TSelection,
		TExcludedMethods,
		TNullabilityMap
	> {
		return (
			table: AnySQLiteTable | Subquery,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		): AnySQLiteSelect => {
			const tableName = table instanceof Subquery ? table[SubqueryConfig].alias : table[Table.Symbol.Name];

			if (this.config.joins[tableName]) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullableMap).length === 1) {
					this.config.fieldsList = this.config.fieldsList.map((field) => ({
						...field,
						path: [this.tableName, ...field.path],
					}));
				}
				this.config.fieldsList.push(
					...orderSelectedFields<AnySQLiteColumn>(
						table instanceof Subquery ? table[SubqueryConfig].selection : table[Table.Symbol.Columns],
						[tableName],
					),
				);
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			this.config.joins[tableName] = { on, table, joinType };

			switch (joinType) {
				case 'left':
					this.joinsNotNullableMap[tableName] = false;
					break;
				case 'right':
					this.joinsNotNullableMap = Object.fromEntries(
						Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
					);
					this.joinsNotNullableMap[tableName] = true;
					break;
				case 'inner':
					this.joinsNotNullableMap[tableName] = true;
					break;
				case 'full':
					this.joinsNotNullableMap = Object.fromEntries(
						Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
					);
					this.joinsNotNullableMap[tableName] = false;
					break;
			}

			return this;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	where(
		where: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join`> {
		if (typeof where === 'function') {
			where = where(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.where = where;
		return this as any;
	}

	having(
		having: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join`> {
		if (typeof having === 'function') {
			having = having(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.having = having;
		return this as any;
	}

	groupBy(
		builder: (aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'groupBy'>;
	groupBy(
		...columns: (AnySQLiteColumn | SQL)[]
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'groupBy'>;
	groupBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>]
			| (AnySQLiteColumn | SQL)[]
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'groupBy'> {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.groupBy = columns as (AnySQLiteColumn | SQL)[];
		}
		return this as any;
	}

	orderBy(
		builder: (aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'orderBy'>;
	orderBy(
		...columns: (AnySQLiteColumn | SQL)[]
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>]
			| (AnySQLiteColumn | SQL)[]
	): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (AnySQLiteColumn | SQL)[];
		}
		return this as any;
	}

	limit(limit: number | Placeholder): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	offset(offset: number | Placeholder): SQLiteSelectWithFilteredMethods<this, 'where' | `${JoinType}Join` | 'offset'> {
		this.config.offset = offset;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
			get: SelectResult<TSelection, TSelectMode, TNullabilityMap>;
			values: any[][];
		}
	> {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const query = this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.fieldsList);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
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

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}
}
