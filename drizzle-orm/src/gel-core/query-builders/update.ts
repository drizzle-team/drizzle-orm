import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { GelDialect } from '~/gel-core/dialect.ts';
import type {
	GelPreparedQuery,
	GelQueryResultHKT,
	GelQueryResultKind,
	GelSession,
	PreparedQueryConfig,
} from '~/gel-core/session.ts';
import { GelTable } from '~/gel-core/table.ts';
import type {
	AppendToNullabilityMap,
	AppendToResult,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type Query, SQL, type SQLWrapper } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import {
	type Assume,
	getTableLikeName,
	mapUpdateSet,
	type NeonAuthToken,
	orderSelectedFields,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { GelColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { GelViewBase } from '../view-base.ts';
import type { GelSelectJoinConfig, SelectedFields, SelectedFieldsOrdered } from './select.types.ts';

export interface GelUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: GelTable;
	from?: GelTable | Subquery | GelViewBase | SQL;
	joins: GelSelectJoinConfig[];
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type GelUpdateSetSource<TTable extends GelTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL
			| GelColumn;
	}
	& {};

export class GelUpdateBuilder<TTable extends GelTable, TQueryResult extends GelQueryResultHKT> {
	static readonly [entityKind]: string = 'GelUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: GelSession,
		private dialect: GelDialect,
		private withList?: Subquery[],
	) {}

	private authToken?: NeonAuthToken;
	setToken(token: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	set(
		values: GelUpdateSetSource<TTable>,
	): GelUpdateWithout<GelUpdateBase<TTable, TQueryResult>, false, 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'> {
		return new GelUpdateBase<TTable, TQueryResult>(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		);
	}
}

export type GelUpdateWithout<
	T extends AnyGelUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	GelUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['from'],
		T['_']['returning'],
		T['_']['nullabilityMap'],
		T['_']['joins'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type GelUpdateWithJoins<
	T extends AnyGelUpdate,
	TDynamic extends boolean,
	TFrom extends GelTable | Subquery | GelViewBase | SQL,
> = TDynamic extends true ? T : Omit<
	GelUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		TFrom,
		T['_']['returning'],
		AppendToNullabilityMap<T['_']['nullabilityMap'], GetSelectTableName<TFrom>, 'inner'>,
		[...T['_']['joins'], {
			name: GetSelectTableName<TFrom>;
			joinType: 'inner';
			table: TFrom;
		}],
		TDynamic,
		Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
	>,
	Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
>;

export type GelUpdateJoinFn<
	T extends AnyGelUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends GelTable | Subquery | GelViewBase | SQL,
>(
	table: TJoinedTable,
	on:
		| (
			(
				updateTable: T['_']['table']['_']['columns'],
				from: T['_']['from'] extends GelTable ? T['_']['from']['_']['columns']
					: T['_']['from'] extends Subquery | GelViewBase ? T['_']['from']['_']['selectedFields']
					: never,
			) => SQL | undefined
		)
		| SQL
		| undefined,
) => GelUpdateJoin<T, TDynamic, TJoinType, TJoinedTable>;

export type GelUpdateJoin<
	T extends AnyGelUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends GelTable | Subquery | GelViewBase | SQL,
> = TDynamic extends true ? T : GelUpdateBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['returning'],
	AppendToNullabilityMap<T['_']['nullabilityMap'], GetSelectTableName<TJoinedTable>, TJoinType>,
	[...T['_']['joins'], {
		name: GetSelectTableName<TJoinedTable>;
		joinType: TJoinType;
		table: TJoinedTable;
	}],
	TDynamic,
	T['_']['excludedMethods']
>;

type Join = {
	name: string | undefined;
	joinType: JoinType;
	table: GelTable | Subquery | GelViewBase | SQL;
};

type AccumulateToResult<
	T extends AnyGelUpdate,
	TSelectMode extends SelectMode,
	TJoins extends Join[],
	TSelectedFields extends ColumnsSelection,
> = TJoins extends [infer TJoin extends Join, ...infer TRest extends Join[]] ? AccumulateToResult<
		T,
		TSelectMode extends 'partial' ? TSelectMode : 'multiple',
		TRest,
		AppendToResult<
			T['_']['table']['_']['name'],
			TSelectedFields,
			TJoin['name'],
			TJoin['table'] extends Table ? TJoin['table']['_']['columns']
				: TJoin['table'] extends Subquery ? Assume<TJoin['table']['_']['selectedFields'], SelectedFields>
				: never,
			TSelectMode extends 'partial' ? TSelectMode : 'multiple'
		>
	>
	: TSelectedFields;

export type GelUpdateReturningAll<T extends AnyGelUpdate, TDynamic extends boolean> = GelUpdateWithout<
	GelUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['from'],
		SelectResult<
			AccumulateToResult<
				T,
				'single',
				T['_']['joins'],
				GetSelectTableSelection<T['_']['table']>
			>,
			'partial',
			T['_']['nullabilityMap']
		>,
		T['_']['nullabilityMap'],
		T['_']['joins'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type GelUpdateReturning<
	T extends AnyGelUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = GelUpdateWithout<
	GelUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['from'],
		SelectResult<
			AccumulateToResult<
				T,
				'partial',
				T['_']['joins'],
				TSelectedFields
			>,
			'partial',
			T['_']['nullabilityMap']
		>,
		T['_']['nullabilityMap'],
		T['_']['joins'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type GelUpdatePrepare<T extends AnyGelUpdate> = GelPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? GelQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type GelUpdateDynamic<T extends AnyGelUpdate> = GelUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['returning'],
	T['_']['nullabilityMap']
>;

export type GelUpdate<
	TTable extends GelTable = GelTable,
	TQueryResult extends GelQueryResultHKT = GelQueryResultHKT,
	TFrom extends GelTable | Subquery | GelViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = GelUpdateBase<TTable, TQueryResult, TFrom, TReturning, TNullabilityMap, TJoins, true, never>;

export type AnyGelUpdate = GelUpdateBase<any, any, any, any, any, any, any, any>;

export interface GelUpdateBase<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	TFrom extends GelTable | Subquery | GelViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[], 'gel'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'gel';
		readonly table: TTable;
		readonly joins: TJoins;
		readonly nullabilityMap: TNullabilityMap;
		readonly queryResult: TQueryResult;
		readonly from: TFrom;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class GelUpdateBase<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	TFrom extends GelTable | Subquery | GelViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[], 'gel'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'GelUpdate';

	private config: GelUpdateConfig;
	private tableName: string | undefined;
	private joinsNotNullableMap: Record<string, boolean>;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: GelSession,
		private dialect: GelDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { set, table, withList, joins: [] };
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	from<TFrom extends GelTable | Subquery | GelViewBase | SQL>(
		source: TFrom,
	): GelUpdateWithJoins<this, TDynamic, TFrom> {
		const tableName = getTableLikeName(source);
		if (typeof tableName === 'string') {
			this.joinsNotNullableMap[tableName] = true;
		}
		this.config.from = source;
		return this as any;
	}

	private getTableLikeFields(table: GelTable | Subquery | GelViewBase): Record<string, unknown> {
		if (is(table, GelTable)) {
			return table[Table.Symbol.Columns];
		} else if (is(table, Subquery)) {
			return table._.selectedFields;
		}
		return table[ViewBaseConfig].selectedFields;
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): GelUpdateJoinFn<this, TDynamic, TJoinType> {
		return ((
			table: GelTable | Subquery | GelViewBase | SQL,
			on: ((updateTable: TTable, from: TFrom) => SQL | undefined) | SQL | undefined,
		) => {
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (typeof on === 'function') {
				const from = this.config.from && !is(this.config.from, SQL)
					? this.getTableLikeFields(this.config.from)
					: undefined;
				on = on(
					new Proxy(
						this.config.table[Table.Symbol.Columns],
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as any,
					from && new Proxy(
						from,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as any,
				);
			}

			this.config.joins.push({ on, table, joinType, alias: tableName });

			if (typeof tableName === 'string') {
				switch (joinType) {
					case 'left': {
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
					case 'right': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'inner': {
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'full': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
				}
			}

			return this as any;
		}) as any;
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	/**
	 * Adds a 'where' clause to the query.
	 *
	 * Calling this method will update only those rows that fulfill a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update}
	 *
	 * @param where the 'where' clause.
	 *
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be updated.
	 *
	 * ```ts
	 * // Update all cars with green color
	 * await db.update(cars).set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'));
	 * // or
	 * await db.update(cars).set({ color: 'red' })
	 *   .where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Update all BMW cars with a green color
	 * await db.update(cars).set({ color: 'red' })
	 *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Update all cars with the green or blue color
	 * await db.update(cars).set({ color: 'red' })
	 *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): GelUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/**
	 * Adds a `returning` clause to the query.
	 *
	 * Calling this method will return the specified fields of the updated rows. If no fields are specified, all fields will be returned.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update#update-with-returning}
	 *
	 * @example
	 * ```ts
	 * // Update all cars with the green color and return all fields
	 * const updatedCars: Car[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'))
	 *   .returning();
	 *
	 * // Update all cars with the green color and return only their id and brand fields
	 * const updatedCarsIdsAndBrands: { id: number, brand: string }[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'))
	 *   .returning({ id: cars.id, brand: cars.brand });
	 * ```
	 */
	returning(): GelUpdateReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): GelUpdateReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields?: SelectedFields,
	): GelUpdateWithout<AnyGelUpdate, TDynamic, 'returning'> {
		if (!fields) {
			fields = Object.assign({}, this.config.table[Table.Symbol.Columns]);

			if (this.config.from) {
				const tableName = getTableLikeName(this.config.from);

				if (typeof tableName === 'string' && this.config.from && !is(this.config.from, SQL)) {
					const fromFields = this.getTableLikeFields(this.config.from);
					fields[tableName] = fromFields as any;
				}

				for (const join of this.config.joins) {
					const tableName = getTableLikeName(join.table);

					if (typeof tableName === 'string' && !is(join.table, SQL)) {
						const fromFields = this.getTableLikeFields(join.table);
						fields[tableName] = fromFields as any;
					}
				}
			}
		}

		this.config.returning = orderSelectedFields<GelColumn>(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): GelUpdatePrepare<this> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TReturning[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'update',
			tables: extractUsedTable(this.config.table),
		});
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}

	prepare(name: string): GelUpdatePrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};

	$dynamic(): GelUpdateDynamic<this> {
		return this as any;
	}
}
