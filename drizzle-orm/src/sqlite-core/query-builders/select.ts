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
	SetOperator,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SQL, View } from '~/sql/sql.ts';
import type { ColumnsSelection, Placeholder, Query } from '~/sql/sql.ts';
import type { SQLiteColumn } from '~/sqlite-core/columns/index.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteSession } from '~/sqlite-core/session.ts';
import type { SubqueryWithSelection } from '~/sqlite-core/subquery.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { Table } from '~/table.ts';
import {
	applyMixins,
	getTableColumns,
	getTableLikeName,
	haveSameKeys,
	orderSelectedFields,
	type ValueOrArray,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type {
	AnySQLiteSelect,
	CreateSQLiteSelectFromBuilderMode,
	GetSQLiteSetOperators,
	SelectedFields,
	SetOperatorRightSelect,
	SQLiteCreateSetOperatorFn,
	SQLiteJoinFn,
	SQLiteSelectConfig,
	SQLiteSelectDynamic,
	SQLiteSelectExecute,
	SQLiteSelectHKT,
	SQLiteSelectHKTBase,
	SQLiteSelectPrepare,
	SQLiteSelectWithout,
	SQLiteSetOperatorExcludedMethods,
	SQLiteSetOperatorWithResult,
} from './select.types.ts';
import { Subquery, SubqueryConfig } from '~/subquery.ts';
import { SQLiteViewBase } from '../view-base.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';

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

		return new SQLiteSelectBase({
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

export abstract class SQLiteSelectQueryBuilderBase<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult> {
	static readonly [entityKind]: string = 'SQLiteSelectQueryBuilder';

	override readonly _: {
		dialect: 'sqlite';
		readonly hkt: THKT;
		readonly tableName: TTableName;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
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
			setOperators: [],
		};
		this.isPartialSelect = isPartialSelect;
		this.session = session;
		this.dialect = dialect;
		this._ = {
			selectedFields: fields as TSelectedFields,
		} as this['_'];
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): SQLiteJoinFn<this, TDynamic, TJoinType> {
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

			return this as any;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	private createSetOperator(
		type: SetOperator,
		isAll: boolean,
	): <TValue extends SQLiteSetOperatorWithResult<TResult>>(
		rightSelection:
			| ((setOperators: GetSQLiteSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => SQLiteSelectWithout<
		this,
		TDynamic,
		SQLiteSetOperatorExcludedMethods,
		true
	> {
		return (rightSelection) => {
			const rightSelect = (typeof rightSelection === 'function'
				? rightSelection(getSQLiteSetOperators())
				: rightSelection) as TypedQueryBuilder<
					any,
					TResult
				>;

			if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
				throw new Error(
					'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
				);
			}

			this.config.setOperators.push({ type, isAll, rightSelect });
			return this as any;
		};
	}

	union = this.createSetOperator('union', false);

	unionAll = this.createSetOperator('union', true);

	intersect = this.createSetOperator('intersect', false);

	except = this.createSetOperator('except', false);

	/** @internal */
	addSetOperators(setOperators: SQLiteSelectConfig['setOperators']): SQLiteSelectWithout<
		this,
		TDynamic,
		SQLiteSetOperatorExcludedMethods,
		true
	> {
		this.config.setOperators.push(...setOperators);
		return this as any;
	}

	where(
		where: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
	): SQLiteSelectWithout<this, TDynamic, 'where'> {
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
		having: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): SQLiteSelectWithout<this, TDynamic, 'having'> {
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
		builder: (aliases: this['_']['selection']) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(...columns: (SQLiteColumn | SQL)[]): SQLiteSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): SQLiteSelectWithout<this, TDynamic, 'groupBy'> {
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
		return this as any;
	}

	orderBy(
		builder: (aliases: this['_']['selection']) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SQLiteColumn | SQL)[]): SQLiteSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): SQLiteSelectWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);

			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

			if (this.config.setOperators.length > 0) {
				this.config.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.orderBy = orderByArray;
			}
		} else {
			const orderByArray = columns as (SQLiteColumn | SQL | SQL.Aliased)[];

			if (this.config.setOperators.length > 0) {
				this.config.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.orderBy = orderByArray;
			}
		}
		return this as any;
	}

	limit(limit: number | Placeholder): SQLiteSelectWithout<this, TDynamic, 'limit'> {
		if (this.config.setOperators.length > 0) {
			this.config.setOperators.at(-1)!.limit = limit;
		} else {
			this.config.limit = limit;
		}
		return this as any;
	}

	offset(offset: number | Placeholder): SQLiteSelectWithout<this, TDynamic, 'offset'> {
		if (this.config.setOperators.length > 0) {
			this.config.setOperators.at(-1)!.offset = offset;
		} else {
			this.config.offset = offset;
		}
		return this as any;
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
	): SubqueryWithSelection<this['_']['selectedFields'], TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<this['_']['selectedFields'], TAlias>;
	}

	/** @internal */
	override getSelectedFields(): this['_']['selectedFields'] {
		return new Proxy(
			this.config.fields,
			new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as this['_']['selectedFields'];
	}

	$dynamic(): SQLiteSelectDynamic<this> {
		return this;
	}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SQLiteSelectBase<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends
	SQLiteSelectQueryBuilderBase<
		SQLiteSelectHKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	QueryPromise<TResult>
{}

export class SQLiteSelectBase<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends SQLiteSelectQueryBuilderBase<
	SQLiteSelectHKT,
	TTableName,
	TResultType,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> implements RunnableQuery<TResult, 'sqlite'> {
	static readonly [entityKind]: string = 'SQLiteSelect';

	prepare(isOneTimeQuery?: boolean): SQLiteSelectPrepare<this> {
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

	async execute(): Promise<SQLiteSelectExecute<this>> {
		return this.all() as SQLiteSelectExecute<this>;
	}
}

applyMixins(SQLiteSelectBase, [QueryPromise]);

function createSetOperator(type: SetOperator, isAll: boolean): SQLiteCreateSetOperatorFn {
	return (leftSelect, rightSelect, ...restSelects) => {
		const setOperators = [rightSelect, ...restSelects].map((select) => ({
			type,
			isAll,
			rightSelect: select as AnySQLiteSelect,
		}));

		for (const setOperator of setOperators) {
			if (!haveSameKeys((leftSelect as any).getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
				throw new Error(
					'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
				);
			}
		}

		return (leftSelect as AnySQLiteSelect).addSetOperators(setOperators) as any;
	};
}

const getSQLiteSetOperators = () => ({
	union,
	unionAll,
	intersect,
	except,
});

export const union = createSetOperator('union', false);

export const unionAll = createSetOperator('union', true);

export const intersect = createSetOperator('intersect', false);

export const except = createSetOperator('except', false);
