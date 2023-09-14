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
import type { PgSession, PreparedQuery, PreparedQueryConfig } from '~/pg-core/session.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { tracer } from '~/tracing.ts';
import { type ColumnsSelection } from '~/view.ts';
import { PgColumn } from '../columns/common.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgSelect, PgSelectQueryBuilder } from './select.ts';
import type { PgSelectHKTBase, PgSelectQueryBuilderHKT } from './select.types.ts';

type SetOperator = 'union' | 'intersect' | 'except';

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
	static readonly [entityKind]: string = 'PgSetOperator';

	private session: PgSession | undefined;
	private dialect: PgDialect;
	private config: {
		fields: Record<string, unknown>;
		joinsNotNullableMap: Record<string, boolean>;
		limit?: number | Placeholder;
		orderBy?: (PgColumn | SQL | SQL.Aliased)[];
	};

	constructor(
		private operator: SetOperator,
		private isAll: boolean,
		private leftSelect:
			| PgSelect<TTableName, TSelection, TSelectMode>
			| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
		private rightSelect:
			| PgSelect<TTableName, TSelection, TSelectMode>
			| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	) {
		super();

		const { session, dialect, joinsNotNullableMap, fields } = leftSelect.getSetOperatorConfig();
		this.session = session;
		this.dialect = dialect;
		this.config = {
			fields,
			joinsNotNullableMap,
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
		const { session, config: { fields, joinsNotNullableMap }, dialect } = this;
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
>(
	leftSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	rightSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
): PgSetOperator<
	THKT,
	TTableName,
	TSelection,
	TSelectMode
> {
	return new PgSetOperator('union', false, leftSelect, rightSelect);
}

export function unionAll<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
>(
	leftSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	rightSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
): PgSetOperator<
	THKT,
	TTableName,
	TSelection,
	TSelectMode
> {
	return new PgSetOperator('union', true, leftSelect, rightSelect);
}

export function intersect<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
>(
	leftSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	rightSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
): PgSetOperator<
	THKT,
	TTableName,
	TSelection,
	TSelectMode
> {
	return new PgSetOperator('intersect', false, leftSelect, rightSelect);
}

export function intersectAll<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
>(
	leftSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	rightSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
): PgSetOperator<
	THKT,
	TTableName,
	TSelection,
	TSelectMode
> {
	return new PgSetOperator('intersect', true, leftSelect, rightSelect);
}

export function except<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
>(
	leftSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	rightSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
): PgSetOperator<
	THKT,
	TTableName,
	TSelection,
	TSelectMode
> {
	return new PgSetOperator('except', false, leftSelect, rightSelect);
}

export function exceptAll<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
>(
	leftSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
	rightSelect:
		| PgSelect<TTableName, TSelection, TSelectMode>
		| PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>,
): PgSetOperator<
	THKT,
	TTableName,
	TSelection,
	TSelectMode
> {
	return new PgSetOperator('except', true, leftSelect, rightSelect);
}
