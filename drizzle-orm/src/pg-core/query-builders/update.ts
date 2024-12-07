import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type {
	PgPreparedQuery,
	PgQueryResultHKT,
	PgQueryResultKind,
	PgSession,
	PreparedQueryConfig,
} from '~/pg-core/session.ts';
import { PgTable } from '~/pg-core/table.ts';
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
import type { PgColumn } from '../columns/common.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgSelectJoinConfig, SelectedFields, SelectedFieldsOrdered } from './select.types.ts';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: PgTable;
	from?: PgTable | Subquery | PgViewBase | SQL;
	joins: PgSelectJoinConfig[];
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type PgUpdateSetSource<TTable extends PgTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL
			| PgColumn;
	}
	& {};

export class PgUpdateBuilder<TTable extends PgTable, TQueryResult extends PgQueryResultHKT> {
	static readonly [entityKind]: string = 'PgUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
		private withList?: Subquery[],
	) {}

	private authToken?: NeonAuthToken;
	setToken(token: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	set(
		values: PgUpdateSetSource<TTable>,
	): PgUpdateWithout<PgUpdateBase<TTable, TQueryResult>, false, 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'> {
		return new PgUpdateBase<TTable, TQueryResult>(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		).setToken(this.authToken);
	}
}

export type PgUpdateWithout<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	PgUpdateBase<
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

export type PgUpdateWithJoins<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TFrom extends PgTable | Subquery | PgViewBase | SQL,
> = TDynamic extends true ? T : Omit<
	PgUpdateBase<
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

export type PgUpdateJoinFn<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
>(
	table: TJoinedTable,
	on:
		| (
			(
				updateTable: T['_']['table']['_']['columns'],
				from: T['_']['from'] extends PgTable ? T['_']['from']['_']['columns']
					: T['_']['from'] extends Subquery | PgViewBase ? T['_']['from']['_']['selectedFields']
					: never,
			) => SQL | undefined
		)
		| SQL
		| undefined,
) => PgUpdateJoin<T, TDynamic, TJoinType, TJoinedTable>;

export type PgUpdateJoin<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
> = TDynamic extends true ? T : PgUpdateBase<
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
	table: PgTable | Subquery | PgViewBase | SQL;
};

type AccumulateToResult<
	T extends AnyPgUpdate,
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

export type PgUpdateReturningAll<T extends AnyPgUpdate, TDynamic extends boolean> = PgUpdateWithout<
	PgUpdateBase<
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

export type PgUpdateReturning<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = PgUpdateWithout<
	PgUpdateBase<
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

export type PgUpdatePrepare<T extends AnyPgUpdate> = PgPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgUpdateDynamic<T extends AnyPgUpdate> = PgUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['returning'],
	T['_']['nullabilityMap']
>;

export type PgUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = PgUpdateBase<TTable, TQueryResult, TFrom, TReturning, TNullabilityMap, TJoins, true, never>;

export type AnyPgUpdate = PgUpdateBase<any, any, any, any, any, any, any, any>;

export interface PgUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly table: TTable;
		readonly joins: TJoins;
		readonly nullabilityMap: TNullabilityMap;
		readonly queryResult: TQueryResult;
		readonly from: TFrom;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class PgUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'PgUpdate';

	private config: PgUpdateConfig;
	private tableName: string | undefined;
	private joinsNotNullableMap: Record<string, boolean>;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: PgSession,
		private dialect: PgDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { set, table, withList, joins: [] };
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	from<TFrom extends PgTable | Subquery | PgViewBase | SQL>(
		source: TFrom,
	): PgUpdateWithJoins<this, TDynamic, TFrom> {
		const tableName = getTableLikeName(source);
		if (typeof tableName === 'string') {
			this.joinsNotNullableMap[tableName] = true;
		}
		this.config.from = source;
		return this as any;
	}

	private getTableLikeFields(table: PgTable | Subquery | PgViewBase): Record<string, unknown> {
		if (is(table, PgTable)) {
			return table[Table.Symbol.Columns];
		} else if (is(table, Subquery)) {
			return table._.selectedFields;
		}
		return table[ViewBaseConfig].selectedFields;
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): PgUpdateJoinFn<this, TDynamic, TJoinType> {
		return ((
			table: PgTable | Subquery | PgViewBase | SQL,
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
	where(where: SQL | undefined): PgUpdateWithout<this, TDynamic, 'where'> {
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
	returning(): PgUpdateReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): PgUpdateReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields?: SelectedFields,
	): PgUpdateWithout<AnyPgUpdate, TDynamic, 'returning'> {
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

		this.config.returning = orderSelectedFields<PgColumn>(fields);
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
	_prepare(name?: string): PgUpdatePrepare<this> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TReturning[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}

	prepare(name: string): PgUpdatePrepare<this> {
		return this._prepare(name);
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues, this.authToken);
	};

	$dynamic(): PgUpdateDynamic<this> {
		return this as any;
	}
}
