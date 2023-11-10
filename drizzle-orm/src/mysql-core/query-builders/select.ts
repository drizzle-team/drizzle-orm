import { entityKind, is } from '~/entity.ts';
import type { MySqlColumn } from '~/mysql-core/columns/index.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { MySqlSession, PreparedQueryConfig, PreparedQueryHKTBase } from '~/mysql-core/session.ts';
import type { SubqueryWithSelection } from '~/mysql-core/subquery.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
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
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Query } from '~/sql/sql.ts';
import { SQL, View } from '~/sql/sql.ts';
import { Subquery, SubqueryConfig } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { applyMixins, getTableColumns, getTableLikeName, haveSameKeys, type ValueOrArray } from '~/utils.ts';
import { orderSelectedFields } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { MySqlViewBase } from '../view-base.ts';
import type {
	AnyMySqlSelect,
	CreateMySqlSelectFromBuilderMode,
	GetMySqlSetOperators,
	LockConfig,
	LockStrength,
	MySqlCreateSetOperatorFn,
	MySqlJoinFn,
	MySqlSelectConfig,
	MySqlSelectDynamic,
	MySqlSelectHKT,
	MySqlSelectHKTBase,
	MySqlSelectPrepare,
	MySqlSelectWithout,
	MySqlSetOperatorExcludedMethods,
	MySqlSetOperatorWithResult,
	SelectedFields,
	SetOperatorRightSelect,
} from './select.types.ts';

export class MySqlSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	static readonly [entityKind]: string = 'MySqlSelectBuilder';

	private fields: TSelection;
	private session: MySqlSession | undefined;
	private dialect: MySqlDialect;
	private withList: Subquery[] = [];
	private distinct: boolean | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: MySqlSession | undefined;
			dialect: MySqlDialect;
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

	from<TFrom extends MySqlTable | Subquery | MySqlViewBase | SQL>(
		source: TFrom,
	): CreateMySqlSelectFromBuilderMode<
		TBuilderMode,
		GetSelectTableName<TFrom>,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial',
		TPreparedQueryHKT
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
		} else if (is(source, MySqlViewBase)) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (is(source, SQL)) {
			fields = {};
		} else {
			fields = getTableColumns<MySqlTable>(source);
		}

		return new MySqlSelectBase(
			{
				table: source,
				fields,
				isPartialSelect,
				session: this.session,
				dialect: this.dialect,
				withList: this.withList,
				distinct: this.distinct,
			},
		) as any;
	}
}

export abstract class MySqlSelectQueryBuilderBase<
	THKT extends MySqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult> {
	static readonly [entityKind]: string = 'MySqlSelectQueryBuilder';

	override readonly _: {
		readonly hkt: THKT;
		readonly tableName: TTableName;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
	};

	protected config: MySqlSelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;
	private isPartialSelect: boolean;
	/** @internal */
	readonly session: MySqlSession | undefined;
	protected dialect: MySqlDialect;

	constructor(
		{ table, fields, isPartialSelect, session, dialect, withList, distinct }: {
			table: MySqlSelectConfig['table'];
			fields: MySqlSelectConfig['fields'];
			isPartialSelect: boolean;
			session: MySqlSession | undefined;
			dialect: MySqlDialect;
			withList: Subquery[];
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
	): MySqlJoinFn<this, TDynamic, TJoinType> {
		return (
			table: MySqlTable | Subquery | MySqlViewBase | SQL,
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
	): <TValue extends MySqlSetOperatorWithResult<TResult>>(
		rightSelection:
			| ((setOperators: GetMySqlSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => MySqlSelectWithout<
		this,
		TDynamic,
		MySqlSetOperatorExcludedMethods,
		true
	> {
		return (rightSelection) => {
			const rightSelect = (typeof rightSelection === 'function'
				? rightSelection(getMySqlSetOperators())
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

	intersectAll = this.createSetOperator('intersect', true);

	except = this.createSetOperator('except', false);

	exceptAll = this.createSetOperator('except', true);

	/** @internal */
	addSetOperators(setOperators: MySqlSelectConfig['setOperators']): MySqlSelectWithout<
		this,
		TDynamic,
		MySqlSetOperatorExcludedMethods,
		true
	> {
		this.config.setOperators.push(...setOperators);
		return this as any;
	}

	where(
		where: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): MySqlSelectWithout<this, TDynamic, 'where'> {
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
	): MySqlSelectWithout<this, TDynamic, 'having'> {
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
		builder: (aliases: this['_']['selection']) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>,
	): MySqlSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(...columns: (MySqlColumn | SQL | SQL.Aliased)[]): MySqlSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>]
			| (MySqlColumn | SQL | SQL.Aliased)[]
	): MySqlSelectWithout<this, TDynamic, 'groupBy'> {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.groupBy = columns as (MySqlColumn | SQL | SQL.Aliased)[];
		}
		return this as any;
	}

	orderBy(
		builder: (aliases: this['_']['selection']) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>,
	): MySqlSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (MySqlColumn | SQL | SQL.Aliased)[]): MySqlSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>]
			| (MySqlColumn | SQL | SQL.Aliased)[]
	): MySqlSelectWithout<this, TDynamic, 'orderBy'> {
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
			const orderByArray = columns as (MySqlColumn | SQL | SQL.Aliased)[];

			if (this.config.setOperators.length > 0) {
				this.config.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.orderBy = orderByArray;
			}
		}
		return this as any;
	}

	limit(limit: number): MySqlSelectWithout<this, TDynamic, 'limit'> {
		if (this.config.setOperators.length > 0) {
			this.config.setOperators.at(-1)!.limit = limit;
		} else {
			this.config.limit = limit;
		}
		return this as any;
	}

	offset(offset: number): MySqlSelectWithout<this, TDynamic, 'offset'> {
		if (this.config.setOperators.length > 0) {
			this.config.setOperators.at(-1)!.offset = offset;
		} else {
			this.config.offset = offset;
		}
		return this as any;
	}

	for(strength: LockStrength, config: LockConfig = {}): MySqlSelectWithout<this, TDynamic, 'for'> {
		this.config.lockingClause = { strength, config };
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

	$dynamic(): MySqlSelectDynamic<this> {
		return this as any;
	}
}

export interface MySqlSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends
	MySqlSelectQueryBuilderBase<
		MySqlSelectHKT,
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	QueryPromise<TResult>
{}

export class MySqlSelectBase<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends MySqlSelectQueryBuilderBase<
	MySqlSelectHKT,
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static readonly [entityKind]: string = 'MySqlSelect';

	prepare(): MySqlSelectPrepare<this> {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const fieldsList = orderSelectedFields<MySqlColumn>(this.config.fields);
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[] },
			TPreparedQueryHKT
		>(this.dialect.sqlToQuery(this.getSQL()), fieldsList);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query as MySqlSelectPrepare<this>;
	}

	execute = ((placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	}) as ReturnType<this['prepare']>['execute'];

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();
}

applyMixins(MySqlSelectBase, [QueryPromise]);

function createSetOperator(type: SetOperator, isAll: boolean): MySqlCreateSetOperatorFn {
	return (leftSelect, rightSelect, ...restSelects) => {
		const setOperators = [rightSelect, ...restSelects].map((select) => ({
			type,
			isAll,
			rightSelect: select as AnyMySqlSelect,
		}));

		for (const setOperator of setOperators) {
			if (!haveSameKeys((leftSelect as any).getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
				throw new Error(
					'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
				);
			}
		}

		return (leftSelect as AnyMySqlSelect).addSetOperators(setOperators) as any;
	};
}

const getMySqlSetOperators = () => ({
	union,
	unionAll,
	intersect,
	intersectAll,
	except,
	exceptAll,
});

export const union = createSetOperator('union', false);

export const unionAll = createSetOperator('union', true);

export const intersect = createSetOperator('intersect', false);

export const intersectAll = createSetOperator('intersect', true);

export const except = createSetOperator('except', false);

export const exceptAll = createSetOperator('except', true);
