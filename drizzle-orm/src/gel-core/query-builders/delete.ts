import { entityKind } from '~/entity.ts';
import type { GelDialect } from '~/gel-core/dialect.ts';
import type {
	GelPreparedQuery,
	GelQueryResultHKT,
	GelQueryResultKind,
	GelSession,
	PreparedQueryConfig,
} from '~/gel-core/session.ts';
import type { GelTable } from '~/gel-core/table.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { orderSelectedFields } from '~/utils.ts';
import type { GelColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export type GelDeleteWithout<
	T extends AnyGelDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		GelDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type GelDelete<
	TTable extends GelTable = GelTable,
	TQueryResult extends GelQueryResultHKT = GelQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = GelDeleteBase<TTable, TQueryResult, TReturning, true, never>;

export interface GelDeleteConfig {
	where?: SQL | undefined;
	table: GelTable;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type GelDeleteReturningAll<
	T extends AnyGelDeleteBase,
	TDynamic extends boolean,
> = GelDeleteWithout<
	GelDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type GelDeleteReturning<
	T extends AnyGelDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = GelDeleteWithout<
	GelDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type GelDeletePrepare<T extends AnyGelDeleteBase> = GelPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? GelQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type GelDeleteDynamic<T extends AnyGelDeleteBase> = GelDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type AnyGelDeleteBase = GelDeleteBase<any, any, any, any, any>;

export interface GelDeleteBase<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[], 'gel'>,
	SQLWrapper
{
	readonly _: {
		dialect: 'gel';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class GelDeleteBase<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[], 'gel'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'GelDelete';

	private config: GelDeleteConfig;

	constructor(
		table: TTable,
		private session: GelSession,
		private dialect: GelDialect,
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
	where(where: SQL | undefined): GelDeleteWithout<this, TDynamic, 'where'> {
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
	returning(): GelDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): GelDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): GelDeleteReturning<this, TDynamic, any> | GelDeleteReturningAll<this, TDynamic> {
		this.config.returning = orderSelectedFields<GelColumn>(fields);
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
	_prepare(name?: string): GelDeletePrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			});
		});
	}

	prepare(name: string): GelDeletePrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};

	$dynamic(): GelDeleteDynamic<this> {
		return this as any;
	}
}
