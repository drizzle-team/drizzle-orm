import { entityKind } from '~/entity.ts';
import {
	applyMixins,
	haveSameKeys,
	orderSelectedFields,
	type Placeholder,
	type Query,
	QueryPromise,
	SelectionProxyHandler,
	type SQL,
	Subquery,
	type ValueOrArray,
} from '~/index.ts';
import type {
	MySqlSession,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/mysql-core/session.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
	SetOperator,
} from '~/query-builders/select.types.ts';
import { type ColumnsSelection } from '~/view.ts';
import type { MySqlColumn } from '../columns/common.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { SubqueryWithSelection } from '../subquery.ts';
import type {
	MySqlCreateSetOperatorFn,
	MySqlSelectHKTBase,
	MySqlSetOperationConfig,
	MySqlSetOperatorBaseWithResult,
	MySqlSetOperatorDynamic,
	MySqlSetOperatorInterface,
	MySqlSetOperatorWithout,
	SetOperatorRightSelect,
} from './select.types.ts';

const getMySqlSetOperators = () => {
	return {
		union,
		unionAll,
		intersect,
		intersectAll,
		except,
		exceptAll,
	};
};

type MySqlSetOperators = ReturnType<typeof getMySqlSetOperators>;

export abstract class MySqlSetOperatorBuilder<
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
	static readonly [entityKind]: string = 'MySqlSetOperatorBuilder';

	abstract override readonly _: {
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

	protected abstract joinsNotNullableMap: Record<string, boolean>;
	protected abstract config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
		offset?: number | Placeholder;
	};
	/* @internal */
	abstract readonly session: MySqlSession | undefined;
	protected abstract dialect: MySqlDialect;

	/** @internal */
	getSetOperatorConfig() {
		return {
			session: this.session,
			dialect: this.dialect,
			joinsNotNullableMap: this.joinsNotNullableMap,
			fields: this.config.fields,
		};
	}

	private createSetOperator(
		type: SetOperator,
		isAll: boolean,
	): <TValue extends MySqlSetOperatorBaseWithResult<TResult>>(
		rightSelect:
			| ((setOperator: MySqlSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => MySqlSetOperatorBase<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap,
		false,
		never,
		TResult,
		TSelectedFields
	> {
		return (rightSelect) => {
			const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getMySqlSetOperators()) : rightSelect;
			return new MySqlSetOperatorBase(type, isAll, this as any, rightSelectOrig as any);
		};
	}

	union = this.createSetOperator('union', false);

	unionAll = this.createSetOperator('union', true);

	intersect = this.createSetOperator('intersect', false);

	intersectAll = this.createSetOperator('intersect', true);

	except = this.createSetOperator('except', false);

	exceptAll = this.createSetOperator('except', true);
}

export interface MySqlSetOperatorBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult>, QueryPromise<TResult> {}

export class MySqlSetOperatorBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends MySqlSetOperatorBuilder<
	MySqlSelectHKTBase,
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
	static readonly [entityKind]: string = 'MySqlSetOperator';

	readonly _: {
		readonly hkt: MySqlSelectHKTBase;
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

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: MySqlSetOperationConfig;
	/* @internal */
	readonly session: MySqlSession | undefined;
	protected dialect: MySqlDialect;

	constructor(
		operator: SetOperator,
		isAll: boolean,
		leftSelect: MySqlSetOperatorInterface<
			MySqlSelectHKTBase,
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
		rightSelect: TypedQueryBuilder<any, TResult>,
	) {
		super();

		const leftSelectedFields = leftSelect.getSelectedFields();
		const rightSelectedFields = rightSelect.getSelectedFields();

		if (!haveSameKeys(leftSelectedFields, rightSelectedFields)) {
			throw new Error(
				'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
			);
		}

		const { session, dialect, joinsNotNullableMap, fields } = leftSelect.getSetOperatorConfig();

		this._ = {
			selectedFields: fields,
		} as this['_'];

		this.session = session;
		this.dialect = dialect;
		this.joinsNotNullableMap = joinsNotNullableMap;
		this.config = {
			fields,
			operator,
			isAll,
			leftSelect,
			rightSelect,
		};
	}

	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>]
			| (MySqlColumn | SQL | SQL.Aliased)[]
	): MySqlSetOperatorWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (MySqlColumn | SQL | SQL.Aliased)[];
		}
		return this as any;
	}

	limit(limit: number): MySqlSetOperatorWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	offset(offset: number | Placeholder): MySqlSetOperatorWithout<this, TDynamic, 'offset'> {
		this.config.offset = offset;
		return this as any;
	}

	/** @internal */
	override getSQL(): SQL<unknown> {
		return this.dialect.buildSetOperationQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare() {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const fieldsList = orderSelectedFields<MySqlColumn>(this.config.fields);
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TResult },
			TPreparedQueryHKT
		>(this.dialect.sqlToQuery(this.getSQL()), fieldsList);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query as PreparedQueryKind<
			TPreparedQueryHKT,
			PreparedQueryConfig & {
				execute: TResult;
				iterator: SelectResult<TSelection, TSelectMode, TNullabilityMap>;
			},
			true
		>;
	}

	execute = ((placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	}) as ReturnType<this['prepare']>['execute'];

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			console.log('placeholderValues', placeholderValues);
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<TSelectedFields, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<TSelectedFields, TAlias>;
	}

	$dynamic(): MySqlSetOperatorDynamic<this> {
		return this as any;
	}
}

applyMixins(MySqlSetOperatorBase, [QueryPromise]);

function createSetOperator(type: SetOperator, isAll: boolean): MySqlCreateSetOperatorFn {
	return (leftSelect, rightSelect, ...restSelects) => {
		if (restSelects.length === 0) {
			return new MySqlSetOperatorBase(type, isAll, leftSelect, rightSelect as any) as any;
		}

		const [select, ...rest] = restSelects;
		if (!select) throw new Error('Cannot pass undefined values to any set operator');

		return createSetOperator(type, isAll)(
			new MySqlSetOperatorBase(type, isAll, leftSelect, rightSelect as any),
			select as any,
			...rest,
		);
	};
}

export const union = createSetOperator('union', false);

export const unionAll = createSetOperator('union', true);

export const intersect = createSetOperator('intersect', false);

export const intersectAll = createSetOperator('intersect', true);

export const except = createSetOperator('except', false);

export const exceptAll = createSetOperator('except', true);
