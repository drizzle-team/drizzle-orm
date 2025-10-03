import type { CockroachDialect } from '~/cockroach-core/dialect.ts';
import type {
	CockroachPreparedQuery,
	CockroachQueryResultHKT,
	CockroachQueryResultKind,
	CockroachSession,
	PreparedQueryConfig,
} from '~/cockroach-core/session.ts';
import type { CockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { CockroachColumn } from '../columns/common.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export type CockroachDeleteWithout<
	T extends AnyCockroachDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		CockroachDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['selectedFields'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type CockroachDelete<
	TTable extends CockroachTable = CockroachTable,
	TQueryResult extends CockroachQueryResultHKT = CockroachQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = CockroachDeleteBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface CockroachDeleteConfig {
	where?: SQL | undefined;
	table: CockroachTable;
	returningFields?: SelectedFieldsFlat;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type CockroachDeleteReturningAll<
	T extends AnyCockroachDeleteBase,
	TDynamic extends boolean,
> = CockroachDeleteWithout<
	CockroachDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['table']['_']['columns'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type CockroachDeleteReturning<
	T extends AnyCockroachDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = CockroachDeleteWithout<
	CockroachDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		TSelectedFields,
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type CockroachDeletePrepare<T extends AnyCockroachDeleteBase> = CockroachPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? CockroachQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type CockroachDeleteDynamic<T extends AnyCockroachDeleteBase> = CockroachDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['selectedFields'],
	T['_']['returning']
>;

export type AnyCockroachDeleteBase = CockroachDeleteBase<any, any, any, any, any, any>;

export interface CockroachDeleteBase<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	QueryPromise<TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<
		TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[],
		'cockroach'
	>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'cockroach';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class CockroachDeleteBase<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		TypedQueryBuilder<
			TSelectedFields,
			TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]
		>,
		RunnableQuery<
			TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[],
			'cockroach'
		>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachDelete';

	private config: CockroachDeleteConfig;

	constructor(
		table: TTable,
		private session: CockroachSession,
		private dialect: CockroachDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, withList };
	}

	/**
	 * Adds a `where` clause to the query.
	 *
	 * Calling this method will delete only those rows that fulfill a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 *
	 * @param where the `where` clause.
	 *
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be deleted.
	 *
	 * ```ts
	 * // Delete all cars with green color
	 * await db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * await db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Delete all BMW cars with a green color
	 * await db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Delete all cars with the green or blue color
	 * await db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): CockroachDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/**
	 * Adds a `returning` clause to the query.
	 *
	 * Calling this method will return the specified fields of the deleted rows. If no fields are specified, all fields will be returned.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete#delete-with-return}
	 *
	 * @example
	 * ```ts
	 * // Delete all cars with the green color and return all fields
	 * const deletedCars: Car[] = await db.delete(cars)
	 *   .where(eq(cars.color, 'green'))
	 *   .returning();
	 *
	 * // Delete all cars with the green color and return only their id and brand fields
	 * const deletedCarsIdsAndBrands: { id: number, brand: string }[] = await db.delete(cars)
	 *   .where(eq(cars.color, 'green'))
	 *   .returning({ id: cars.id, brand: cars.brand });
	 * ```
	 */
	returning(): CockroachDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): CockroachDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): CockroachDeleteReturning<this, TDynamic, any> | CockroachDeleteReturningAll<this, TDynamic> {
		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<CockroachColumn>(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): CockroachDeletePrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true);
		});
	}

	prepare(name: string): CockroachDeletePrepare<this> {
		return this._prepare(name);
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues, this.authToken);
		});
	};

	/** @internal */
	getSelectedFields(): this['_']['selectedFields'] {
		return (
			this.config.returningFields
				? new Proxy(
					this.config.returningFields,
					new SelectionProxyHandler({
						alias: getTableName(this.config.table),
						sqlAliasedBehavior: 'alias',
						sqlBehavior: 'error',
					}),
				)
				: undefined
		) as this['_']['selectedFields'];
	}

	$dynamic(): CockroachDeleteDynamic<this> {
		return this as any;
	}
}
