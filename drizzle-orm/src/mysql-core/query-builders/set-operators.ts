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

	union(
		rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
	): MySqlSetOperator<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	> {
		return new MySqlSetOperator('union', false, this, rightSelect) as any;
	}

	unionAll(
		rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
	): MySqlSetOperator<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	> {
		return new MySqlSetOperator('union', true, this, rightSelect) as any;
	}

	intersect(
		rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
	): MySqlSetOperator<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	> {
		return new MySqlSetOperator('intersect', false, this, rightSelect) as any;
	}

	intersectAll(
		rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
	): MySqlSetOperator<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	> {
		return new MySqlSetOperator('intersect', true, this, rightSelect) as any;
	}

	except(
		rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
	): MySqlSetOperator<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	> {
		return new MySqlSetOperator('except', false, this, rightSelect) as any;
	}

	exceptAll(
		rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
	): MySqlSetOperator<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	> {
		return new MySqlSetOperator('except', true, this, rightSelect) as any;
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
		private rightSelect: MySqlSetOperatorBuilder<
			TTableName,
			TSelection,
			TSelectMode,
			TPreparedQueryHKT,
			TNullabilityMap
		>,
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
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
	rightSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
): MySqlSetOperator<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	return new MySqlSetOperator('union', false, leftSelect, rightSelect);
}

export function unionAll<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
	rightSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
): MySqlSetOperator<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	return new MySqlSetOperator('union', true, leftSelect, rightSelect);
}

export function intersect<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
	rightSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
): MySqlSetOperator<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	return new MySqlSetOperator('intersect', false, leftSelect, rightSelect);
}

export function intersectAll<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
	rightSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
): MySqlSetOperator<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	return new MySqlSetOperator('intersect', true, leftSelect, rightSelect);
}

export function except<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
	rightSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
): MySqlSetOperator<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	return new MySqlSetOperator('except', false, leftSelect, rightSelect);
}

export function exceptAll<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
>(
	leftSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
	rightSelect: MySqlSetOperatorBuilder<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap
	>,
): MySqlSetOperator<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap
> {
	return new MySqlSetOperator('except', true, leftSelect, rightSelect);
}
