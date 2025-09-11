import type { CockroachDialect } from '~/cockroach-core/dialect.ts';
import type {
	CockroachPreparedQuery,
	CockroachQueryResultHKT,
	CockroachQueryResultKind,
	CockroachSession,
	PreparedQueryConfig,
} from '~/cockroach-core/session.ts';
import { CockroachTable } from '~/cockroach-core/table.ts';
import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
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
import { getTableName, type InferInsertModel, Table } from '~/table.ts';
import {
	type Assume,
	type DrizzleTypeError,
	type Equal,
	getTableLikeName,
	mapUpdateSet,
	type NeonAuthToken,
	orderSelectedFields,
	type Simplify,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { CockroachColumn } from '../columns/common.ts';
import type { CockroachViewBase } from '../view-base.ts';
import type {
	CockroachSelectJoinConfig,
	SelectedFields,
	SelectedFieldsOrdered,
	TableLikeHasEmptySelection,
} from './select.types.ts';

export interface CockroachUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: CockroachTable;
	from?: CockroachTable | Subquery | CockroachViewBase | SQL;
	joins: CockroachSelectJoinConfig[];
	returningFields?: SelectedFields;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type CockroachUpdateSetSource<TTable extends CockroachTable> =
	& {
		[Key in keyof InferInsertModel<TTable>]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL
			| CockroachColumn
			| undefined;
	}
	& {};

export class CockroachUpdateBuilder<TTable extends CockroachTable, TQueryResult extends CockroachQueryResultHKT> {
	static readonly [entityKind]: string = 'CockroachUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: CockroachSession,
		private dialect: CockroachDialect,
		private withList?: Subquery[],
	) {}

	set(
		values: CockroachUpdateSetSource<TTable>,
	): CockroachUpdateWithout<
		CockroachUpdateBase<TTable, TQueryResult>,
		false,
		'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'
	> {
		return new CockroachUpdateBase<TTable, TQueryResult>(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		);
	}
}

export type CockroachUpdateWithout<
	T extends AnyCockroachUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	CockroachUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['from'],
		T['_']['selectedFields'],
		T['_']['returning'],
		T['_']['nullabilityMap'],
		T['_']['joins'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type CockroachUpdateWithJoins<
	T extends AnyCockroachUpdate,
	TDynamic extends boolean,
	TFrom extends CockroachTable | Subquery | CockroachViewBase | SQL,
> = TDynamic extends true ? T : Omit<
	CockroachUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		TFrom,
		T['_']['selectedFields'],
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

export type CockroachUpdateJoinFn<
	T extends AnyCockroachUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends CockroachTable | Subquery | CockroachViewBase | SQL,
>(
	table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
			"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
		>
		: TJoinedTable,
	on:
		| (
			(
				updateTable: T['_']['table']['_']['columns'],
				from: T['_']['from'] extends CockroachTable ? T['_']['from']['_']['columns']
					: T['_']['from'] extends Subquery | CockroachViewBase ? T['_']['from']['_']['selectedFields']
					: never,
			) => SQL | undefined
		)
		| SQL
		| undefined,
) => CockroachUpdateJoin<T, TDynamic, TJoinType, TJoinedTable>;

export type CockroachUpdateJoin<
	T extends AnyCockroachUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends CockroachTable | Subquery | CockroachViewBase | SQL,
> = TDynamic extends true ? T : CockroachUpdateBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['selectedFields'],
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
	table: CockroachTable | Subquery | CockroachViewBase | SQL;
};

type AccumulateToResult<
	T extends AnyCockroachUpdate,
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

export type CockroachUpdateReturningAll<T extends AnyCockroachUpdate, TDynamic extends boolean> =
	CockroachUpdateWithout<
		CockroachUpdateBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['from'],
			Equal<T['_']['joins'], []> extends true ? T['_']['table']['_']['columns'] : Simplify<
				& Record<T['_']['table']['_']['name'], T['_']['table']['_']['columns']>
				& {
					[K in keyof T['_']['joins'] as T['_']['joins'][K]['table']['_']['name']]:
						T['_']['joins'][K]['table']['_']['columns'];
				}
			>,
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

export type CockroachUpdateReturning<
	T extends AnyCockroachUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = CockroachUpdateWithout<
	CockroachUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['from'],
		TSelectedFields,
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

export type CockroachUpdatePrepare<T extends AnyCockroachUpdate> = CockroachPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? CockroachQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type CockroachUpdateDynamic<T extends AnyCockroachUpdate> = CockroachUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['returning'],
	T['_']['nullabilityMap']
>;

export type CockroachUpdate<
	TTable extends CockroachTable = CockroachTable,
	TQueryResult extends CockroachQueryResultHKT = CockroachQueryResultHKT,
	TFrom extends CockroachTable | Subquery | CockroachViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = CockroachUpdateBase<
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	true,
	never
>;

export type AnyCockroachUpdate = CockroachUpdateBase<any, any, any, any, any, any, any, any, any>;

export interface CockroachUpdateBase<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	TFrom extends CockroachTable | Subquery | CockroachViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
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
		readonly joins: TJoins;
		readonly nullabilityMap: TNullabilityMap;
		readonly queryResult: TQueryResult;
		readonly from: TFrom;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class CockroachUpdateBase<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	TFrom extends CockroachTable | Subquery | CockroachViewBase | SQL | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<
			TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[],
			'cockroach'
		>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachUpdate';

	private config: CockroachUpdateConfig;
	private tableName: string | undefined;
	private joinsNotNullableMap: Record<string, boolean>;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: CockroachSession,
		private dialect: CockroachDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { set, table, withList, joins: [] };
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	from<TFrom extends CockroachTable | Subquery | CockroachViewBase | SQL>(
		source: TableLikeHasEmptySelection<TFrom> extends true ? DrizzleTypeError<
				"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
			>
			: TFrom,
	): CockroachUpdateWithJoins<this, TDynamic, TFrom> {
		const src = source as TFrom;
		const tableName = getTableLikeName(src);
		if (typeof tableName === 'string') {
			this.joinsNotNullableMap[tableName] = true;
		}
		this.config.from = src;
		return this as any;
	}

	private getTableLikeFields(table: CockroachTable | Subquery | CockroachViewBase): Record<string, unknown> {
		if (is(table, CockroachTable)) {
			return table[Table.Symbol.Columns];
		} else if (is(table, Subquery)) {
			return table._.selectedFields;
		}
		return table[ViewBaseConfig].selectedFields;
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): CockroachUpdateJoinFn<this, TDynamic, TJoinType> {
		return ((
			table: CockroachTable | Subquery | CockroachViewBase | SQL,
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
	where(where: SQL | undefined): CockroachUpdateWithout<this, TDynamic, 'where'> {
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
	returning(): CockroachUpdateReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): CockroachUpdateReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields?: SelectedFields,
	): CockroachUpdateWithout<AnyCockroachUpdate, TDynamic, 'returning'> {
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

		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<CockroachColumn>(fields);
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
	_prepare(name?: string): CockroachUpdatePrepare<this> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TReturning[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}

	prepare(name: string): CockroachUpdatePrepare<this> {
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

	$dynamic(): CockroachUpdateDynamic<this> {
		return this as any;
	}
}
