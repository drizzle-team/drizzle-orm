import { type Placeholder, type Query, SQL } from '~/sql';
import type { AnySQLiteColumn } from '~/sqlite-core/columns';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
import { Table } from '~/table';

import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';

import { QueryBuilder } from '~/query-builders/query-builder';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types';
import type { SubqueryWithSelection } from '~/sqlite-core/subquery';
import { SelectionProxyHandler, Subquery, SubqueryConfig } from '~/subquery';
import { getTableColumns, orderSelectedFields, type Simplify, type ValueOrArray } from '~/utils';
import { ViewBaseConfig } from '~/view';
import { SQLiteViewBase } from '../view';
import type {
	JoinFn,
	SelectedFields,
	SQLiteSelectConfig,
	SQLiteSelectHKT,
	SQLiteSelectHKTBase,
	SQLiteSelectQueryBuilderHKT,
} from './select.types';

type CreateSQLiteSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? SQLiteSelect<TTableName, TResultType, TRunResult, TSelection, TSelectMode>
	: SQLiteSelectQueryBuilder<SQLiteSelectQueryBuilderHKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode>;

export class SQLiteSelectBuilder<
	TSelection extends SelectedFields | undefined,
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

	from<TFrom extends AnySQLiteTable | Subquery | SQLiteViewBase | SQL>(
		source: TFrom,
	): CreateSQLiteSelectFromBuilderMode<
		TBuilderMode,
		GetSelectTableName<TFrom>,
		TResultType,
		TRunResult,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	> {
		const isPartialSelect = !!this.fields;

		let fields: SelectedFields;
		if (this.fields) {
			fields = this.fields;
		} else if (source instanceof Subquery) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source[SubqueryConfig].selection).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectedFields[string]]),
			);
		} else if (source instanceof SQLiteViewBase) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (source instanceof SQL) {
			fields = {};
		} else {
			fields = getTableColumns<AnySQLiteTable>(source);
		}

		const fieldsList = orderSelectedFields<AnySQLiteColumn>(fields);
		return new SQLiteSelect(
			source,
			fields,
			fieldsList,
			isPartialSelect,
			this.session,
			this.dialect,
			this.withList,
		) as any;
	}
}

export abstract class SQLiteSelectQueryBuilder<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends QueryBuilder<BuildSubquerySelection<TSelection, TNullabilityMap>> {
	override readonly _: {
		readonly selectMode: TSelectMode;
		readonly selection: TSelection;
		readonly selectedFields: BuildSubquerySelection<TSelection, TNullabilityMap>;
	};

	protected config: SQLiteSelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;

	constructor(
		table: SQLiteSelectConfig['table'],
		fields: SQLiteSelectConfig['fields'],
		fieldsList: SQLiteSelectConfig['fieldsList'],
		private isPartialSelect: boolean,
		protected session: SQLiteSession | undefined,
		protected dialect: SQLiteDialect,
		withList: Subquery[],
	) {
		super();
		this.config = {
			withList,
			table,
			fields,
			fieldsList,
			joins: [],
			orderBy: [],
			groupBy: [],
		};
		this._ = {
			selectedFields: fields as BuildSubquerySelection<TSelection, TNullabilityMap>,
		} as this['_'];
		this.tableName = table instanceof Subquery
			? table[SubqueryConfig].alias
			: table instanceof SQLiteViewBase
			? table[ViewBaseConfig].name
			: table instanceof SQL
			? undefined
			: table[Table.Symbol.Name];
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<
		THKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelectMode,
		TJoinType,
		TSelection,
		TNullabilityMap
	> {
		return (
			table: AnySQLiteTable | Subquery | SQL,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const baseTableName = this.tableName;
			const tableName = table instanceof Subquery
				? table[SubqueryConfig].alias
				: table instanceof SQL
				? undefined
				: table[Table.Symbol.Name];

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select and we're not selecting from raw SQL, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === 'string') {
					this.config.fieldsList = this.config.fieldsList.map((field) => ({
						...field,
						path: [baseTableName, ...field.path],
					}));
				}
				if (typeof tableName === 'string' && !(table instanceof SQL)) {
					this.config.fieldsList.push(
						...orderSelectedFields<AnySQLiteColumn>(
							table instanceof Subquery ? table[SubqueryConfig].selection : table[Table.Symbol.Columns],
							[tableName],
						),
					);
				}
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			this.config.joins.push({ on, table, joinType, alias: tableName });

			if (typeof tableName === 'string') {
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
			}

			return this;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	where(where: ((aliases: TSelection) => SQL | undefined) | SQL | undefined): this {
		if (typeof where === 'function') {
			where = where(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.where = where;
		return this;
	}

	having(having: ((aliases: TSelection) => SQL | undefined) | SQL | undefined): this {
		if (typeof having === 'function') {
			having = having(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.having = having;
		return this;
	}

	groupBy(builder: (aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>): this;
	groupBy(...columns: (AnySQLiteColumn | SQL)[]): this;
	groupBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>]
			| (AnySQLiteColumn | SQL | SQL.Aliased)[]
	): this {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.groupBy = columns as (AnySQLiteColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	orderBy(builder: (aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (AnySQLiteColumn | SQL)[]): this;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnySQLiteColumn | SQL | SQL.Aliased>]
			| (AnySQLiteColumn | SQL | SQL.Aliased)[]
	): this {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (AnySQLiteColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	limit(limit: number | Placeholder): this {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number | Placeholder): this {
		this.config.offset = offset;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'subquery_selection', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}
}

export interface SQLiteSelect<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends
	SQLiteSelectQueryBuilder<
		SQLiteSelectHKT,
		TTableName | undefined,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap
	>
{}

export class SQLiteSelect<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends SQLiteSelectQueryBuilder<
	SQLiteSelectHKT,
	TTableName,
	TResultType,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap
> {
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
		// TODO: implement transaction support
		const query = this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.fieldsList, undefined);
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
}
