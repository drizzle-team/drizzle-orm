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
	type ValidateShape,
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
} from '~/query-builders/select.types.ts';
import { type ColumnsSelection } from '~/view.ts';
import type { MySqlColumn } from '../columns/common.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { SubqueryWithSelection } from '../subquery.ts';

type SetOperator = 'union' | 'intersect' | 'except';

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

type SetOperatorRightSelect<
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TValue extends MySqlSetOperatorBuilder<any, infer TSel, infer TMode, any, infer TNull> ? ValidateShape<
		SelectResult<TSel, TMode, TNull>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>,
		TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
	>
	: TValue;

type SetOperatorRestSelect<
	TValue extends readonly TypedQueryBuilder<any, any[]>[],
	Valid,
> = TValue extends [infer First, ...infer Rest]
	? First extends MySqlSetOperatorBuilder<any, infer TSel, infer TMode, any, infer TNull>
		? Rest extends TypedQueryBuilder<any, any[]>[] ? [
				ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue[0]>,
				...SetOperatorRestSelect<Rest, Valid>,
			]
		: ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue>
	: never[]
	: TValue;

export interface MySqlSetOperatorConfig {
	fields: Record<string, unknown>;
	operator: SetOperator;
	isAll: boolean;
	leftSelect: MySqlSetOperatorBuilder<any, any, any, any, any, any, any, any, any>;
	rightSelect: TypedQueryBuilder<any, any[]>;
	limit?: number | Placeholder;
	orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	offset?: number | Placeholder;
}

export interface MySqlSetOperatorBuilder<
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
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult>, QueryPromise<TResult> {}

export abstract class MySqlSetOperatorBuilder<
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
> extends TypedQueryBuilder<TSelectedFields, TResult> {
	static readonly [entityKind]: string = 'MySqlSetOperatorBuilder';

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

	private setOperator(
		type: SetOperator,
		isAll: boolean,
	): <TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: MySqlSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	) => MySqlSetOperator<
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
		return (rightSelect) => {
			const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getMySqlSetOperators()) : rightSelect;
			return new MySqlSetOperator(type, isAll, this, rightSelectOrig);
		};
	}

	union = this.setOperator('union', false);

	unionAll = this.setOperator('union', true);

	intersect = this.setOperator('intersect', false);

	intersectAll = this.setOperator('intersect', true);

	except = this.setOperator('except', false);

	exceptAll = this.setOperator('except', true);
}

export class MySqlSetOperator<
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

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: MySqlSetOperatorConfig;
	/* @internal */
	readonly session: MySqlSession | undefined;
	protected dialect: MySqlDialect;

	constructor(
		operator: SetOperator,
		isAll: boolean,
		leftSelect: MySqlSetOperatorBuilder<
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
		rightSelect: TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
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
	) {
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
		return this;
	}

	limit(limit: number) {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number | Placeholder) {
		this.config.offset = offset;
		return this;
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
}

applyMixins(MySqlSetOperatorBuilder, [QueryPromise]);

function setOperator(type: SetOperator, isAll: boolean): <
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap,
		any,
		any
	>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
) => MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	return (leftSelect, rightSelect, ...restSelects) => {
		if (restSelects.length === 0) {
			return new MySqlSetOperator(type, isAll, leftSelect, rightSelect);
		}

		const [select, ...rest] = restSelects;
		if (!select) throw new Error('Cannot pass undefined values to any set operator');

		return setOperator(type, isAll)(new MySqlSetOperator(type, isAll, leftSelect, rightSelect), select, ...rest);
	};
}

export const union = setOperator('union', false);

export const unionAll = setOperator('union', true);

export const intersect = setOperator('intersect', false);

export const intersectAll = setOperator('intersect', true);

export const except = setOperator('except', false);

export const exceptAll = setOperator('except', true);
