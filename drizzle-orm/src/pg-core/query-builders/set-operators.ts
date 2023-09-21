import { entityKind, is } from '~/entity.ts';
import {
	orderSelectedFields,
	type Placeholder,
	type Query,
	SelectionProxyHandler,
	SQL,
	sql,
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
import { applyMixins, type ValidateShape } from '~/utils.ts';
import { type ColumnsSelection } from '~/view.ts';
import { PgColumn } from '../columns/common.ts';
import type { PgDialect } from '../dialect.ts';
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
	union<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

		return new PgSetOperator('union', false, this, rightSelectOrig);
	}

	unionAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

		return new PgSetOperator('union', true, this, rightSelectOrig);
	}

	intersect<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

		return new PgSetOperator('intersect', false, this, rightSelectOrig);
	}

	intersectAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

		return new PgSetOperator('intersect', true, this, rightSelectOrig);
	}

	except<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

		return new PgSetOperator('except', false, this, rightSelectOrig);
	}

	exceptAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: PgSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getPgSetOperators()) : rightSelect;

		return new PgSetOperator('except', true, this, rightSelectOrig);
	}

	abstract orderBy(builder: (aliases: TSelection) => ValueOrArray<PgColumn | SQL | SQL.Aliased>): this;
	abstract orderBy(...columns: (PgColumn | SQL | SQL.Aliased)[]): this;

	abstract limit(limit: number): this;
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
	protected config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (PgColumn | SQL | SQL.Aliased)[];
	};
	/* @internal */
	readonly session: PgSession | undefined;
	protected dialect: PgDialect;

	constructor(
		private operator: SetOperator,
		private isAll: boolean,
		private leftSelect: PgSetOperatorBuilder<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap>,
		private rightSelect: TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	) {
		super();

		const { session, dialect, joinsNotNullableMap, fields } = leftSelect.getSetOperatorConfig();
		this.session = session;
		this.dialect = dialect;
		this.joinsNotNullableMap = joinsNotNullableMap;
		this.config = {
			fields,
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

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	override getSQL(): SQL<unknown> {
		const leftChunk = sql`(${this.leftSelect.getSQL()}) `;
		const rightChunk = sql`(${this.rightSelect.getSQL()})`;

		let orderBySql;
		if (this.config.orderBy && this.config.orderBy.length > 0) {
			const orderByValues: SQL<unknown>[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MySql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderBy of this.config.orderBy) {
				if (is(orderBy, PgColumn)) {
					orderByValues.push(sql.raw(orderBy.name));
				} else if (is(orderBy, SQL)) {
					for (let i = 0; i < orderBy.queryChunks.length; i++) {
						const chunk = orderBy.queryChunks[i];

						if (is(chunk, PgColumn)) {
							orderBy.queryChunks[i] = sql.raw(chunk.name);
						}
					}

					orderByValues.push(sql`${orderBy}`);
				} else {
					orderByValues.push(sql`${orderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)} `;
		}

		const limitSql = this.config.limit ? sql` limit ${this.config.limit}` : undefined;

		const operatorChunk = sql.raw(`${this.operator} ${this.isAll ? 'all ' : ''}`);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}`;
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
}

applyMixins(PgSetOperator, [QueryPromise]);

export function union<
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
): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new PgSetOperator('union', false, leftSelect, rightSelect);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return union(new PgSetOperator('union', false, leftSelect, rightSelect), select, ...rest);
}

export function unionAll<
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
): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new PgSetOperator('union', true, leftSelect, rightSelect);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return unionAll(new PgSetOperator('union', true, leftSelect, rightSelect), select, ...rest);
}

export function intersect<
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
): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new PgSetOperator('intersect', false, leftSelect, rightSelect);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return intersect(new PgSetOperator('intersect', false, leftSelect, rightSelect!), select, ...rest);
}

export function intersectAll<
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
): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new PgSetOperator('intersect', true, leftSelect, rightSelect);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return intersectAll(new PgSetOperator('intersect', true, leftSelect, rightSelect!), select, ...rest);
}

export function except<
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
): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new PgSetOperator('except', false, leftSelect, rightSelect);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return except(new PgSetOperator('except', false, leftSelect, rightSelect!), select, ...rest);
}

export function exceptAll<
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
): PgSetOperator<THKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new PgSetOperator('except', false, leftSelect, rightSelect);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return exceptAll(new PgSetOperator('except', false, leftSelect, rightSelect!), select, ...rest);
}
