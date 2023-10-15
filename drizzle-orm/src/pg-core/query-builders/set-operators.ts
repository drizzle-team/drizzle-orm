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
import type { PgSession, PreparedQuery, PreparedQueryConfig } from '~/pg-core/session.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
	SetOperator,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, haveSameKeys } from '~/utils.ts';
import type { ColumnsSelection } from '~/view.ts';
import type { PgColumn } from '../columns/common.ts';
import type { PgDialect } from '../dialect.ts';
import type { SubqueryWithSelection } from '../subquery.ts';
import type {
	PgCreateSetOperatorFn,
	PgSelectHKTBase,
	PgSetOperationConfig,
	PgSetOperatorBaseWithResult,
	PgSetOperatorDynamic,
	PgSetOperatorInterface,
	PgSetOperatorWithout,
	SetOperatorRightSelect,
} from './select.types.ts';

const getPgSetOperators = () => {
	return {
		union,
		unionAll,
		intersect,
		intersectAll,
		except,
		exceptAll,
	};
};

type PgSetOperators = ReturnType<typeof getPgSetOperators>;

export abstract class PgSetOperatorBuilder<
	THKT extends PgSelectHKTBase,
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
	static readonly [entityKind]: string = 'PgSetOperatorBuilder';

	abstract override readonly _: {
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

	protected abstract joinsNotNullableMap: Record<string, boolean>;
	protected abstract config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (PgColumn | SQL | SQL.Aliased)[];
		offset?: number | Placeholder;
	};
	/* @internal */
	protected abstract readonly session: PgSession | undefined;
	protected abstract dialect: PgDialect;

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
	): <TValue extends PgSetOperatorBaseWithResult<TResult>>(
		rightSelect:
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => PgSetOperatorBase<
		TTableName,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		false,
		never,
		TResult,
		TSelectedFields
	> {
		return (rightSelect) => {
			const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

			return new PgSetOperatorBase(type, isAll, this, rightSelectOrig as any) as any;
		};
	}

	union = this.setOperator('union', false);

	unionAll = this.setOperator('union', true);

	intersect = this.setOperator('intersect', false);

	intersectAll = this.setOperator('intersect', true);

	except = this.setOperator('except', false);

	exceptAll = this.setOperator('except', true);
}

export interface PgSetOperatorBase<
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
	PgSetOperatorBuilder<
		PgSelectHKTBase,
		TTableName,
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

export class PgSetOperatorBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends PgSetOperatorBuilder<
	PgSelectHKTBase,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static readonly [entityKind]: string = 'PgSetOperator';

	readonly _: {
		readonly hkt: PgSelectHKTBase;
		readonly tableName: TTableName;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
	};

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: PgSetOperationConfig;
	/* @internal */
	readonly session: PgSession | undefined;
	protected dialect: PgDialect;

	constructor(
		operator: SetOperator,
		isAll: boolean,
		leftSelect: PgSetOperatorInterface<
			PgSelectHKTBase,
			TTableName,
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
		};
	}

	orderBy(
		builder: (aliases: TSelection) => ValueOrArray<PgColumn | SQL | SQL.Aliased>,
	): PgSetOperatorWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (PgColumn | SQL | SQL.Aliased)[]): PgSetOperatorWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<PgColumn | SQL | SQL.Aliased>]
			| (PgColumn | SQL | SQL.Aliased)[]
	): PgSetOperatorWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (PgColumn | SQL | SQL.Aliased)[];
		}
		return this as any;
	}

	limit(limit: number): PgSetOperatorWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	offset(offset: number | Placeholder): PgSetOperatorWithout<this, TDynamic, 'offset'> {
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

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TResult;
		}
	> {
		const { session, joinsNotNullableMap, config: { fields }, dialect } = this;
		if (!session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const fieldsList = orderSelectedFields<PgColumn>(fields);
			const query = session.prepareQuery<
				PreparedQueryConfig & { execute: TResult }
			>(dialect.sqlToQuery(this.getSQL()), fieldsList, name);
			query.joinsNotNullableMap = joinsNotNullableMap;
			return query;
		});
	}

	/**
	 * Create a prepared statement for this query. This allows
	 * the database to remember this query for the given session
	 * and call it by name, rather than specifying the full query.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-prepare.html|Postgres prepare documentation}
	 */
	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TResult;
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}

	$dynamic(): PgSetOperatorDynamic<this> {
		return this as any;
	}
}

applyMixins(PgSetOperatorBase, [QueryPromise]);

function setOperator(type: SetOperator, isAll: boolean): PgCreateSetOperatorFn {
	return (leftSelect, rightSelect, ...restSelects) => {
		if (restSelects.length === 0) {
			return new PgSetOperatorBase(type, isAll, leftSelect, rightSelect as any) as any;
		}

		const [select, ...rest] = restSelects;
		if (!select) throw new Error('Cannot pass undefined values to any set operator');

		return setOperator(type, isAll)(
			new PgSetOperatorBase(type, isAll, leftSelect, rightSelect as any),
			select as any,
			...rest,
		);
	};
}

export const union = setOperator('union', false);

export const unionAll = setOperator('union', true);

export const intersect = setOperator('intersect', false);

export const intersectAll = setOperator('intersect', true);

export const except = setOperator('except', false);

export const exceptAll = setOperator('except', true);
