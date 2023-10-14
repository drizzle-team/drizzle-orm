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
	SetOperator,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { applyMixins, haveSameKeys, type PromiseOf } from '~/utils.ts';
import type { ColumnsSelection } from '~/view.ts';
import type { SQLiteColumn } from '../columns/common.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SubqueryWithSelection } from '../subquery.ts';
import type {
	AnySQLiteSetOperatorBase,
	CreateSetOperatorFn,
	SetOperatorRightSelect,
	SQLiteSelectHKTBase,
	SQLiteSetOperationConfig,
	SQLiteSetOperatorDynamic,
	SQLiteSetOperatorInterface,
	SQLiteSetOperatorWithout,
} from './select.types.ts';

const getSQLiteSetOperators = () => {
	return {
		union,
		unionAll,
		intersect,
		except,
	};
};

type SQLiteSetOperators = ReturnType<typeof getSQLiteSetOperators>;

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
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<
	TSelectedFields,
	TResult
> {
	static readonly [entityKind]: string = 'SQLiteSetOperatorBuilder';

	abstract override readonly _: {
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

	private createSetOperator(
		type: SetOperator,
		isAll: boolean,
	): <TValue extends AnySQLiteSetOperatorBase>(
		rightSelect:
			| ((setOperator: SQLiteSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => SQLiteSetOperatorBase<
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

			return new SQLiteSetOperatorBase(
				type,
				isAll,
				this,
				rightSelectOrig as any,
			);
		};
	}

	union = this.createSetOperator('union', false);

	unionAll = this.createSetOperator('union', true);

	intersect = this.createSetOperator('intersect', false);

	except = this.createSetOperator('except', false);
}

export interface SQLiteSetOperatorBase<
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
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult>, QueryPromise<TResult>, RunnableQuery<TResult, 'sqlite'> {}

export class SQLiteSetOperatorBase<
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
> extends SQLiteSetOperatorBuilder<
	SQLiteSelectHKTBase,
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

	override readonly _: {
		dialect: 'sqlite';
		readonly hkt: SQLiteSelectHKTBase;
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

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: SQLiteSetOperationConfig;
	/* @internal */
	readonly session: SQLiteSession<any, any, any, any> | undefined;
	protected dialect: SQLiteDialect;

	constructor(
		operator: SetOperator,
		isAll: boolean,
		leftSelect: SQLiteSetOperatorInterface<
			SQLiteSelectHKTBase,
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
		} as SQLiteSetOperationConfig;
	}

	orderBy(
		builder: (aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteSetOperatorWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): SQLiteSetOperatorWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): SQLiteSetOperatorWithout<this, TDynamic, 'orderBy'> {
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
		return this as any;
	}

	limit(limit: number): SQLiteSetOperatorWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	offset(offset: number | Placeholder): SQLiteSetOperatorWithout<this, TDynamic, 'offset'> {
		this.config.offset = offset;
		return this as any;
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

	$dynamic(): SQLiteSetOperatorDynamic<this> {
		return this as any;
	}
}

applyMixins(SQLiteSetOperatorBase, [QueryPromise]);

function createSetOperator(type: SetOperator, isAll: boolean): CreateSetOperatorFn {
	return (leftSelect, rightSelect, ...restSelects) => {
		if (restSelects.length === 0) {
			return new SQLiteSetOperatorBase(type, isAll, leftSelect, rightSelect as any);
		}

		const [select, ...rest] = restSelects;
		if (!select) throw new Error('Cannot pass undefined values to any set operator');

		return createSetOperator(type, isAll)(
			new SQLiteSetOperatorBase(type, isAll, leftSelect, rightSelect as any),
			select as any,
			...rest,
		);
	};
}

export const union = createSetOperator('union', false);

export const unionAll = createSetOperator('union', true);

export const intersect = createSetOperator('intersect', false);

export const except = createSetOperator('except', false);
