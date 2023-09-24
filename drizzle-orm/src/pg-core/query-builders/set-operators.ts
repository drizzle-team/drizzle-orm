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
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, haveSameKeys, type ValidateShape } from '~/utils.ts';
import { type ColumnsSelection } from '~/view.ts';
import { type PgColumn } from '../columns/common.ts';
import type { PgDialect } from '../dialect.ts';
import type { SubqueryWithSelection } from '../subquery.ts';
import type { PgSelectHKTBase } from './select.types.ts';

type SetOperator = 'union' | 'intersect' | 'except';

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

type SetOperatorRightSelect<
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TValue extends PgSetOperatorBuilder<any, any, infer TSel, infer TMode, infer TNull> ? ValidateShape<
		SelectResult<TSel, TMode, TNull>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>,
		TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
	>
	: TValue;

type SetOperatorRestSelect<
	TValue extends readonly TypedQueryBuilder<any, any[]>[],
	Valid,
> = TValue extends [infer First, ...infer Rest]
	? First extends PgSetOperatorBuilder<any, any, infer TSel, infer TMode, infer TNull>
		? Rest extends TypedQueryBuilder<any, any[]>[] ? [
				ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue[0]>,
				...SetOperatorRestSelect<Rest, Valid>,
			]
		: ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue>
	: never[]
	: TValue;

export interface PgSetOperationConfig {
	fields: Record<string, unknown>;
	operator: SetOperator;
	isAll: boolean;
	leftSelect: PgSetOperatorBuilder<any, any, any, any, any>;
	rightSelect: TypedQueryBuilder<any, any[]>;
	limit?: number | Placeholder;
	orderBy?: (PgColumn | SQL | SQL.Aliased)[];
	offset?: number | Placeholder;
}

export abstract class PgSetOperatorBuilder<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends TypedQueryBuilder<
	BuildSubquerySelection<TSelection, TNullabilityMap>,
	SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
> {
	static readonly [entityKind]: string = 'PgSetOperatorBuilder';

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
	): <TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	) => PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		return (rightSelect) => {
			const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

			return new PgSetOperator(type, isAll, this, rightSelectOrig);
		};
	}

	union = this.setOperator('union', false);

	unionAll = this.setOperator('union', true);

	intersect = this.setOperator('intersect', false);

	intersectAll = this.setOperator('intersect', true);

	except = this.setOperator('except', false);

	exceptAll = this.setOperator('except', true);

	abstract orderBy(builder: (aliases: TSelection) => ValueOrArray<PgColumn | SQL | SQL.Aliased>): this;
	abstract orderBy(...columns: (PgColumn | SQL | SQL.Aliased)[]): this;

	abstract limit(limit: number): this;

	abstract offset(offset: number | Placeholder): this;
}

export interface PgSetOperator<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends
	TypedQueryBuilder<
		BuildSubquerySelection<TSelection, TNullabilityMap>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
	>,
	QueryPromise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
{}

export class PgSetOperator<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends PgSetOperatorBuilder<
	THKT,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap
> {
	static readonly [entityKind]: string = 'PgSetOperator';

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: PgSetOperationConfig;
	/* @internal */
	readonly session: PgSession | undefined;
	protected dialect: PgDialect;

	constructor(
		operator: SetOperator,
		isAll: boolean,
		leftSelect: PgSetOperatorBuilder<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap>,
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
			selectedFields: fields as BuildSubquerySelection<TSelection, TNullabilityMap>,
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

	orderBy(builder: (aliases: TSelection) => ValueOrArray<PgColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (PgColumn | SQL | SQL.Aliased)[]): this;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<PgColumn | SQL | SQL.Aliased>]
			| (PgColumn | SQL | SQL.Aliased)[]
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
			this.config.orderBy = columns as (PgColumn | SQL | SQL.Aliased)[];
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

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		const { session, joinsNotNullableMap, config: { fields }, dialect } = this;
		if (!session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const fieldsList = orderSelectedFields<PgColumn>(fields);
			const query = session.prepareQuery<
				PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[] }
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
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
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
}

applyMixins(PgSetOperator, [QueryPromise]);

function setOperator(type: SetOperator, isAll: boolean): <
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: PgSetOperatorBuilder<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
) => PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	return (leftSelect, rightSelect, ...restSelects) => {
		if (restSelects.length === 0) {
			return new PgSetOperator(type, isAll, leftSelect, rightSelect);
		}

		const [select, ...rest] = restSelects;
		if (!select) throw new Error('Cannot pass undefined values to any set operator');

		return setOperator(type, isAll)(new PgSetOperator(type, isAll, leftSelect, rightSelect), select, ...rest);
	};
}

export const union = setOperator('union', false);

export const unionAll = setOperator('union', true);

export const intersect = setOperator('intersect', false);

export const intersectAll = setOperator('intersect', true);

export const except = setOperator('except', false);

export const exceptAll = setOperator('except', true);
