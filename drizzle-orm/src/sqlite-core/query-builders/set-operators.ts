import { entityKind } from '~/entity.ts';
import {
	orderSelectedFields,
	type Placeholder,
	type Query,
	SelectionProxyHandler,
	type SQL,
	Subquery,
	type ValueOrArray,
} from '~/index.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { applyMixins, haveSameKeys, type PromiseOf, type ValidateShape } from '~/utils.ts';
import type { ColumnsSelection } from '~/view.ts';
import type { SQLiteColumn } from '../columns/common.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SubqueryWithSelection } from '../subquery.ts';
import type { SQLiteSelectHKTBase } from './select.types.ts';

type SetOperator = 'union' | 'intersect' | 'except';

const getSQLiteSetOperators = () => {
	return {
		union,
		unionAll,
		intersect,
		except,
	};
};

type SQLiteSetOperators = ReturnType<typeof getSQLiteSetOperators>;

type SetOperatorRightSelect<
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TValue extends SQLiteSetOperatorBuilder<any, any, any, any, infer TSel, infer TMode, infer TNull> ? ValidateShape<
		SelectResult<TSel, TMode, TNull>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>,
		TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
	>
	: TValue;

type SetOperatorRestSelect<
	TValue extends readonly TypedQueryBuilder<any, any[]>[],
	Valid,
> = TValue extends [infer First, ...infer Rest]
	? First extends SQLiteSetOperatorBuilder<any, any, any, any, infer TSel, infer TMode, infer TNull>
		? Rest extends TypedQueryBuilder<any, any[]>[] ? [
				ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue[0]>,
				...SetOperatorRestSelect<Rest, Valid>,
			]
		: ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue>
	: never[]
	: TValue;

export interface SQLiteSetOperationConfig {
	fields: Record<string, unknown>;
	operator: SetOperator;
	isAll: boolean;
	leftSelect: SQLiteSetOperatorBuilder<any, any, any, any, any, any, any, any, any, any>;
	rightSelect: TypedQueryBuilder<any, any[]>;
	limit?: number | Placeholder;
	orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	offset?: number | Placeholder;
}

export abstract class SQLiteSetOperatorBuilder<
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
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<
	TSelectedFields,
	TResult
> {
	static readonly [entityKind]: string = 'SQLiteSetOperatorBuilder';

	protected abstract joinsNotNullableMap: Record<string, boolean>;
	protected abstract config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
		offset?: number | Placeholder;
	};
	/* @internal */
	protected abstract readonly session: SQLiteSession<any, any, any, any> | undefined;
	protected abstract dialect: SQLiteDialect;

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
			| ((setOperator: SQLiteSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	) => SQLiteSetOperator<
		THKT,
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
	> {
		return (rightSelect) => {
			const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getSQLiteSetOperators()) : rightSelect;

			return new SQLiteSetOperator<
				THKT,
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
			>(
				type,
				isAll,
				this,
				rightSelectOrig,
			);
		};
	}

	union = this.setOperator('union', false);

	unionAll = this.setOperator('union', true);

	intersect = this.setOperator('intersect', false);

	except = this.setOperator('except', false);
}

export interface SQLiteSetOperator<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult>, QueryPromise<TResult> {}

export class SQLiteSetOperator<
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
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends SQLiteSetOperatorBuilder<
	THKT,
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
> {
	static readonly [entityKind]: string = 'SQLiteSetOperator';

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: SQLiteSetOperationConfig;
	/* @internal */
	readonly session: SQLiteSession<any, any, any, any> | undefined;
	protected dialect: SQLiteDialect;

	constructor(
		operator: SetOperator,
		isAll: boolean,
		leftSelect: SQLiteSetOperatorBuilder<
			THKT,
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
			selectedFields: fields as TSelectedFields,
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

	orderBy(builder: (aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): this;
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

	limit(limit: number) {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number | Placeholder) {
		this.config.offset = offset;
		return this;
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	override getSQL(): SQL<unknown> {
		return this.dialect.buildSetOperationQuery(this.config);
	}

	prepare(isOneTimeQuery?: boolean): SQLitePreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: TResult;
			get: SelectResult<TSelection, TSelectMode, TNullabilityMap> | undefined;
			values: any[][];
			execute: TResult;
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

	async execute(): Promise<TResult> {
		return this.all() as PromiseOf<ReturnType<this['execute']>>;
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}
}

applyMixins(SQLiteSetOperator, [QueryPromise]);

function setOperator(type: SetOperator, isAll: boolean): <
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: SQLiteSetOperatorBuilder<
		THKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		any,
		any
	>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
) => SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap, any, any> {
	return (leftSelect, rightSelect, ...restSelects) => {
		if (restSelects.length === 0) {
			return new SQLiteSetOperator(type, isAll, leftSelect, rightSelect);
		}

		const [select, ...rest] = restSelects;
		if (!select) throw new Error('Cannot pass undefined values to any set operator');

		return setOperator(type, isAll)(new SQLiteSetOperator(type, isAll, leftSelect, rightSelect), select, ...rest);
	};
}

export const union = setOperator('union', false);

export const unionAll = setOperator('union', true);

export const intersect = setOperator('intersect', false);

export const except = setOperator('except', false);
