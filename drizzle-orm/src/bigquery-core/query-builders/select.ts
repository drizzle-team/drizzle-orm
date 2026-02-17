import type { BigQueryColumn } from '~/bigquery-core/columns/index.ts';
import type { BigQueryDialect } from '~/bigquery-core/dialect.ts';
import type { BigQuerySession, PreparedQueryConfig } from '~/bigquery-core/session.ts';
import { BigQueryTable } from '~/bigquery-core/table.ts';
import { BigQueryViewBase } from '~/bigquery-core/view-base.ts';
import { entityKind, is } from '~/entity.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Placeholder, Query } from '~/sql/sql.ts';
import { SQL, View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, haveSameKeys, orderSelectedFields, type PromiseOf, type ValueOrArray } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type {
	AnyBigQuerySelect,
	AnyBigQuerySelectQueryBuilder,
	BigQueryCreateSetOperatorFn,
	BigQuerySelectConfig,
	BigQuerySelectDynamic,
	BigQuerySelectHKT,
	BigQuerySelectHKTBase,
	BigQuerySelectJoinConfig,
	BigQuerySelectJoinFn,
	BigQuerySelectKind,
	BigQuerySelectPrepare,
	BigQuerySelectQueryBuilderHKT,
	BigQuerySelectWithout,
	BigQuerySetOperatorExcludedMethods,
	BigQuerySetOperatorWithResult,
	CreateBigQuerySelectFromBuilderMode,
	SelectedFields,
	SelectedFieldsFlat,
	SelectedFieldsOrdered,
	SetOperatorRestSelect,
	SetOperatorRightSelect,
} from './select.types.ts';

export class BigQuerySelectBuilder<
	TSelection extends SelectedFields | undefined,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	static readonly [entityKind]: string = 'BigQuerySelectBuilder';

	private fields: TSelection;
	private session: BigQuerySession | undefined;
	private dialect: BigQueryDialect;
	private withList: Subquery[] = [];
	private distinct: boolean | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: BigQuerySession | undefined;
			dialect: BigQueryDialect;
			withList?: Subquery[];
			distinct?: boolean;
		},
	) {
		this.fields = config.fields;
		this.session = config.session;
		this.dialect = config.dialect;
		if (config.withList) {
			this.withList = config.withList;
		}
		this.distinct = config.distinct;
	}

	from<TFrom extends BigQueryTable | Subquery | BigQueryViewBase | SQL>(
		source: TFrom,
	): CreateBigQuerySelectFromBuilderMode<
		TBuilderMode,
		TFrom extends BigQueryTable ? TFrom['_']['name']
			: TFrom extends Subquery ? TFrom['_']['alias']
			: TFrom extends BigQueryViewBase ? TFrom['_']['name']
			: TFrom extends SQL ? undefined
			: never,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	> {
		const isPartialSelect = !!this.fields;

		let fields: SelectedFields;
		if (this.fields) {
			fields = this.fields;
		} else if (is(source, Subquery)) {
			fields = Object.fromEntries(
				Object.keys(source._.selectedFields).map((key) => [key, source[key as unknown as keyof typeof source]]),
			);
		} else if (is(source, BigQueryViewBase)) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (is(source, SQL)) {
			fields = {};
		} else {
			fields = source[Table.Symbol.Columns];
		}

		return new BigQuerySelectBase({
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

export type GetSelectTableSelection<T> = T extends BigQueryTable ? T['_']['columns']
	: T extends Subquery | View ? T['_']['selectedFields']
	: T extends SQL ? {}
	: never;

export abstract class BigQuerySelectQueryBuilderBase<
	THKT extends BigQuerySelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult> {
	static override readonly [entityKind]: string = 'BigQuerySelectQueryBuilder';

	override readonly _: {
		readonly hkt: THKT;
		readonly tableName: TTableName;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
	};

	protected config: BigQuerySelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;
	protected session: BigQuerySession | undefined;
	protected dialect: BigQueryDialect;

	constructor(
		{ table, fields, isPartialSelect, session, dialect, withList, distinct }: {
			table: BigQuerySelectConfig['table'];
			fields: BigQuerySelectConfig['fields'];
			isPartialSelect: boolean;
			session: BigQuerySession | undefined;
			dialect: BigQueryDialect;
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
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
		this.tableName = getTableLikeName(table);
		this.session = session;
		this.dialect = dialect;
		this._ = {
			selectedFields: fields as TSelectedFields,
		} as this['_'];
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): BigQuerySelectJoinFn<this, TDynamic, TJoinType> {
		return ((
			table: BigQueryTable | Subquery | BigQueryViewBase | SQL,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const baseTableName = this.tableName;
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins?.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.joinsNotNullableMap[baseTableName!]) {
				this.joinsNotNullableMap[baseTableName!] = true;
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
		}) as BigQuerySelectJoinFn<this, TDynamic, TJoinType>;
	}

	leftJoin = this.createJoin('left');
	rightJoin = this.createJoin('right');
	innerJoin = this.createJoin('inner');
	fullJoin = this.createJoin('full');
	crossJoin = this.createJoin('cross');

	where(
		where: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): BigQuerySelectWithout<this, TDynamic, 'where'> {
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
	): BigQuerySelectWithout<this, TDynamic, 'having'> {
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
		...columns: (BigQueryColumn | SQL)[]
	): BigQuerySelectWithout<this, TDynamic, 'groupBy'> {
		this.config.groupBy = columns as (BigQueryColumn | SQL | SQL.Aliased)[];
		return this as any;
	}

	orderBy(
		...columns: (BigQueryColumn | SQL)[]
	): BigQuerySelectWithout<this, TDynamic, 'orderBy'> {
		this.config.orderBy = columns as (BigQueryColumn | SQL | SQL.Aliased)[];
		return this as any;
	}

	limit(limit: number | Placeholder): BigQuerySelectWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	offset(offset: number | Placeholder): BigQuerySelectWithout<this, TDynamic, 'offset'> {
		this.config.offset = offset;
		return this as any;
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	override getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<this['_']['selectedFields'], TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({
				alias,
				sqlAliasedBehavior: 'alias',
				sqlBehavior: 'error',
			}),
		) as SubqueryWithSelection<this['_']['selectedFields'], TAlias>;
	}

	$dynamic(): BigQuerySelectDynamic<this> {
		return this as any;
	}
}

export interface BigQuerySelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends
	BigQuerySelectQueryBuilderBase<
		BigQuerySelectHKT,
		TTableName,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>
{}

export class BigQuerySelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends BigQuerySelectQueryBuilderBase<
	BigQuerySelectHKT,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'BigQuerySelect';

	prepare(name: string): BigQuerySelectPrepare<this> {
		const { session, dialect, config, joinsNotNullableMap } = this;
		if (!session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const fieldsList = orderSelectedFields<BigQueryColumn>(config.fields);
			const query = session.prepareQuery<
				PreparedQueryConfig & { execute: TResult }
			>(dialect.sqlToQuery(this.getSQL()), fieldsList, name, true);
			query.joinsNotNullableMap = joinsNotNullableMap;
			return query as BigQuerySelectPrepare<this>;
		});
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this.prepare('execute').execute(placeholderValues);
		});
	};
}

applyMixins(BigQuerySelectBase, [QueryPromise]);

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& Subquery<
		TAlias,
		TSelection
	>
	& TSelection;

function getTableLikeName(table: BigQueryTable | Subquery | BigQueryViewBase | SQL): string | undefined {
	return is(table, Subquery)
		? table._.alias
		: is(table, BigQueryViewBase)
		? table[ViewBaseConfig].name
		: is(table, SQL)
		? undefined
		: table[Table.Symbol.IsAlias]
		? table[Table.Symbol.Name]
		: table[Table.Symbol.BaseName];
}
