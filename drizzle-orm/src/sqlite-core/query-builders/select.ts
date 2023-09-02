import { entityKind, is } from '~/entity.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import { type Placeholder, type Query, SQL } from '~/sql/index.ts';
import type { SQLiteColumn } from '~/sqlite-core/columns/index.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import type { SubqueryWithSelection } from '~/sqlite-core/subquery.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { SelectionProxyHandler, Subquery, SubqueryConfig } from '~/subquery.ts';
import { Table } from '~/table.ts';
import {
	applyMixins,
	getTableColumns,
	getTableLikeName,
	orderSelectedFields,
	type PromiseOf,
	type ValueOrArray,
} from '~/utils.ts';
import { type ColumnsSelection, View, ViewBaseConfig } from '~/view.ts';
import { SQLiteViewBase } from '../view.ts';
import type {
	JoinFn,
	SelectedFields,
	SQLiteSelectConfig,
	SQLiteSelectHKT,
	SQLiteSelectHKTBase,
	SQLiteSelectQueryBuilderHKT,
} from './select.types.ts';

type CreateSQLiteSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? SQLiteSelect<TTableName, TResultType, TRunResult, TSelection, TSelectMode>
	: SQLiteSelectQueryBuilder<SQLiteSelectQueryBuilderHKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode>;

export class SQLiteSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	static readonly [entityKind]: string = 'SQLiteSelectBuilder';

	private fields: TSelection;
	private session: SQLiteSession<any, any, any, any> | undefined;
	private dialect: SQLiteDialect;
	private withList: Subquery[] | undefined;
	private distinct: boolean | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: SQLiteSession<any, any, any, any> | undefined;
			dialect: SQLiteDialect;
			withList?: Subquery[];
			distinct?: boolean;
		},
	) {
		this.fields = config.fields;
		this.session = config.session;
		this.dialect = config.dialect;
		this.withList = config.withList;
		this.distinct = config.distinct;
	}

	from<TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL>(
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
		} else if (is(source, Subquery)) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source[SubqueryConfig].selection).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectedFields[string]]),
			);
		} else if (is(source, SQLiteViewBase)) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (is(source, SQL)) {
			fields = {};
		} else {
			fields = getTableColumns<SQLiteTable>(source);
		}

		return new SQLiteSelect({
			table: source,
			fields,
			isPartialSelect,
			session: this.session,
			dialect: this.dialect,
			withList: this.withList,
			distinct: this.distinct,
		}) as any;
	}
}

export abstract class SQLiteSelectQueryBuilder<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends TypedQueryBuilder<
	BuildSubquerySelection<TSelection, TNullabilityMap>,
	SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
> {
	static readonly [entityKind]: string = 'SQLiteSelectQueryBuilder';

	override readonly _: {
		readonly selectMode: TSelectMode;
		readonly selection: TSelection;
		readonly result: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		readonly selectedFields: BuildSubquerySelection<TSelection, TNullabilityMap>;
	};

	/** @internal */
	config: SQLiteSelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;
	private isPartialSelect: boolean;
	protected session: SQLiteSession<any, any, any, any> | undefined;
	protected dialect: SQLiteDialect;

	constructor(
		{ table, fields, isPartialSelect, session, dialect, withList, distinct }: {
			table: SQLiteSelectConfig['table'];
			fields: SQLiteSelectConfig['fields'];
			isPartialSelect: boolean;
			session: SQLiteSession<any, any, any, any> | undefined;
			dialect: SQLiteDialect;
			withList: Subquery[] | undefined;
			distinct: boolean | undefined;
		},
	) {
		super();
		this.config = {
			withList,
			table,
			fields: { ...fields },
			distinct,
		};
		this.isPartialSelect = isPartialSelect;
		this.session = session;
		this.dialect = dialect;
		this._ = {
			selectedFields: fields as BuildSubquerySelection<TSelection, TNullabilityMap>,
		} as this['_'];
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<THKT, TTableName, TResultType, TRunResult, TSelectMode, TJoinType, TSelection, TNullabilityMap> {
		return (
			table: SQLiteTable | Subquery | SQLiteViewBase | SQL,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const baseTableName = this.tableName;
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins?.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select and we're not selecting from raw SQL, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === 'string') {
					this.config.fields = {
						[baseTableName]: this.config.fields,
					};
				}
				if (typeof tableName === 'string' && !is(table, SQL)) {
					const selection = is(table, Subquery)
						? table[SubqueryConfig].selection
						: is(table, View)
						? table[ViewBaseConfig].selectedFields
						: table[Table.Symbol.Columns];
					this.config.fields[tableName] = selection;
				}
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			if (!this.config.joins) {
				this.config.joins = [];
			}
			this.config.joins.push({ on, table, joinType, alias: tableName });

			if (typeof tableName === 'string') {
				switch (joinType) {
					case 'left': {
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
					case 'right': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'inner': {
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'full': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
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

	groupBy(builder: (aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>): this;
	groupBy(...columns: (SQLiteColumn | SQL)[]): this;
	groupBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
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
			this.config.groupBy = columns as (SQLiteColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	orderBy(builder: (aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (SQLiteColumn | SQL)[]): this;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
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
			this.config.orderBy = columns as (SQLiteColumn | SQL | SQL.Aliased)[];
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

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}

	override getSelectedFields(): BuildSubquerySelection<TSelection, TNullabilityMap> {
		return new Proxy(
			this.config.fields,
			new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as BuildSubquerySelection<TSelection, TNullabilityMap>;
	}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SQLiteSelect<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
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
	>,
	QueryPromise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
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
	static readonly [entityKind]: string = 'SQLiteSelect';

	prepare(isOneTimeQuery?: boolean): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
			get: SelectResult<TSelection, TSelectMode, TNullabilityMap> | undefined;
			values: any[][];
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const fieldsList = orderSelectedFields<SQLiteColumn>(this.config.fields);
		const query = this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			fieldsList,
			'all',
		);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query as ReturnType<this['prepare']>;
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare(true).run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare(true).all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare(true).get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare(true).values(placeholderValues);
	};

	async execute(): Promise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]> {
		return this.all() as PromiseOf<ReturnType<this['execute']>>;
	}
}

applyMixins(SQLiteSelect, [QueryPromise]);
