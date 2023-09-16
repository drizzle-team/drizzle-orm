import { entityKind, is } from '~/entity.ts';
import {
	applyMixins,
	orderSelectedFields,
	type Placeholder,
	type Query,
	QueryPromise,
	SelectionProxyHandler,
	SQL,
	sql,
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
import { MySqlColumn } from '../columns/common.ts';
import type { MySqlDialect } from '../dialect.ts';

type SetOperator = 'union' | 'intersect' | 'except';

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

export interface MySqlSetOperatorBuilder<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends
	TypedQueryBuilder<
		BuildSubquerySelection<TSelection, TNullabilityMap>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
	>,
	QueryPromise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
{}

export abstract class MySqlSetOperatorBuilder<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends TypedQueryBuilder<
	BuildSubquerySelection<TSelection, TNullabilityMap>,
	SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
> {
	static readonly [entityKind]: string = 'MySqlSetOperatorBuilder';

	protected abstract joinsNotNullableMap: Record<string, boolean>;
	protected abstract config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
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
	union<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
		return new MySqlSetOperator('union', false, this, rightSelect);
	}

	unionAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
		return new MySqlSetOperator('union', true, this, rightSelect);
	}

	intersect<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
		return new MySqlSetOperator('intersect', false, this, rightSelect);
	}

	intersectAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
		return new MySqlSetOperator('intersect', true, this, rightSelect);
	}

	except<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
		return new MySqlSetOperator('except', false, this, rightSelect);
	}

	exceptAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
		return new MySqlSetOperator('except', true, this, rightSelect);
	}

	abstract orderBy(builder: (aliases: TSelection) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>): this;
	abstract orderBy(...columns: (MySqlColumn | SQL | SQL.Aliased)[]): this;

	abstract limit(limit: number): this;
}

export class MySqlSetOperator<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends MySqlSetOperatorBuilder<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	static readonly [entityKind]: string = 'MySqlSetOperator';

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	};
	/* @internal */
	readonly session: MySqlSession | undefined;
	protected dialect: MySqlDialect;

	constructor(
		private operator: SetOperator,
		private isAll: boolean,
		private leftSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
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

	override getSQL(): SQL<unknown> {
		const leftChunk = sql`(${this.leftSelect.getSQL()}) `;
		const rightChunk = sql`(${this.rightSelect.getSQL()})`;

		let orderBySql;
		if (this.config.orderBy && this.config.orderBy.length > 0) {
			const orderByValues: SQL<unknown>[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MySql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderBy of this.config.orderBy) {
				if (is(orderBy, MySqlColumn)) {
					orderByValues.push(sql.raw(orderBy.name));
				} else if (is(orderBy, SQL)) {
					for (let i = 0; i < orderBy.queryChunks.length; i++) {
						const chunk = orderBy.queryChunks[i];

						if (is(chunk, MySqlColumn)) {
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
			PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[] },
			TPreparedQueryHKT
		>(this.dialect.sqlToQuery(this.getSQL()), fieldsList);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query as PreparedQueryKind<
			TPreparedQueryHKT,
			PreparedQueryConfig & {
				execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
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
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();
}

applyMixins(MySqlSetOperatorBuilder, [QueryPromise]);

export function union<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
>(
	leftSelect: MySqlSetOperatorBuilder<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap>,
	...rightSelects: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>[]
): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	if (rightSelects.length < 1) {
		throw new Error('This operator requires at least two arguments');
	}

	const [rightSelect, ...rest] = rightSelects;

	if (rightSelect && rest.length === 0) {
		return new MySqlSetOperator('union', false, leftSelect, rightSelect);
	}

	return union(new MySqlSetOperator('union', false, leftSelect, rightSelect!), ...rest);
}

export function unionAll<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
>(
	leftSelect: MySqlSetOperatorBuilder<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap>,
	...rightSelects: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>[]
): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	if (rightSelects.length < 1) {
		throw new Error('This operator requires at least two arguments');
	}

	const [rightSelect, ...rest] = rightSelects;

	if (rightSelect && rest.length === 0) {
		return new MySqlSetOperator('union', true, leftSelect, rightSelect);
	}

	return unionAll(new MySqlSetOperator('union', true, leftSelect, rightSelect!), ...rest);
}

export function intersect<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
>(
	leftSelect: MySqlSetOperatorBuilder<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap>,
	...rightSelects: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>[]
): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	if (rightSelects.length < 1) {
		throw new Error('This operator requires at least two arguments');
	}

	const [rightSelect, ...rest] = rightSelects;

	if (rightSelect && rest.length === 0) {
		return new MySqlSetOperator('intersect', false, leftSelect, rightSelect);
	}

	return intersect(new MySqlSetOperator('intersect', false, leftSelect, rightSelect!), ...rest);
}

export function intersectAll<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
>(
	leftSelect: MySqlSetOperatorBuilder<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap>,
	...rightSelects: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>[]
): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	if (rightSelects.length < 1) {
		throw new Error('This operator requires at least two arguments');
	}

	const [rightSelect, ...rest] = rightSelects;

	if (rightSelect && rest.length === 0) {
		return new MySqlSetOperator('intersect', true, leftSelect, rightSelect);
	}

	return intersectAll(new MySqlSetOperator('intersect', true, leftSelect, rightSelect!), ...rest);
}

export function except<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
>(
	leftSelect: MySqlSetOperatorBuilder<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap>,
	...rightSelects: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>[]
): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	if (rightSelects.length < 1) {
		throw new Error('This operator requires at least two arguments');
	}

	const [rightSelect, ...rest] = rightSelects;

	if (rightSelect && rest.length === 0) {
		return new MySqlSetOperator('except', false, leftSelect, rightSelect);
	}

	return except(new MySqlSetOperator('except', false, leftSelect, rightSelect!), ...rest);
}

export function exceptAll<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
>(
	leftSelect: MySqlSetOperatorBuilder<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap>,
	...rightSelects: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>[]
): MySqlSetOperator<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TNullabilityMap> {
	if (rightSelects.length < 1) {
		throw new Error('This operator requires at least two arguments');
	}

	const [rightSelect, ...rest] = rightSelects;

	if (rightSelect && rest.length === 0) {
		return new MySqlSetOperator('except', false, leftSelect, rightSelect);
	}

	return exceptAll(new MySqlSetOperator('except', false, leftSelect, rightSelect!), ...rest);
}
