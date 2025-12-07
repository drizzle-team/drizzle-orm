import type { WithCacheConfig } from '~/cache/core/types.ts';
import { EffectWrapper } from '~/effect-core/effectable.ts';
import { entityKind, is } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTable } from '~/pg-core/table.ts';
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
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type Query, SQL, type SQLWrapper } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import {
	type Assume,
	type DrizzleTypeError,
	type Equal,
	getTableLikeName,
	mapUpdateSet,
	orderSelectedFields,
	type Simplify,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { PgColumn } from '../columns/common.ts';
import type {
	PgSelectJoinConfig,
	SelectedFields,
	SelectedFieldsOrdered,
	TableLikeHasEmptySelection,
} from '../query-builders/select.types.ts';
import type { Join, PgUpdateSetSource } from '../query-builders/update.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '../session.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgViewBase } from '../view-base.ts';
import type { EffectPgCorePreparedQuery } from './prepared-query.ts';
import type { EffectPgCoreSession } from './session.ts';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: PgTable;
	from?: PgTable | Subquery | PgViewBase | SQL;
	joins: PgSelectJoinConfig[];
	returningFields?: SelectedFields;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export class PgUpdateBuilder<TTable extends PgTable, TQueryResult extends PgQueryResultHKT> {
	static readonly [entityKind]: string = 'PgUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: EffectPgCoreSession,
		private dialect: PgDialect,
		private withList?: Subquery[],
	) {}

	set(
		values: PgUpdateSetSource<TTable>,
	): EffectPgUpdateWithout<
		EffectPgUpdateBase<TTable, TQueryResult>,
		false,
		'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'
	> {
		return new EffectPgUpdateBase<TTable, TQueryResult>(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		);
	}
}

export type EffectPgUpdateWithout<
	T extends AnyEffectPgUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	EffectPgUpdateBase<
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

export type EffectPgUpdateWithJoins<
	T extends AnyEffectPgUpdate,
	TDynamic extends boolean,
	TFrom extends PgTable | Subquery | PgViewBase | SQL,
> = TDynamic extends true ? T : Omit<
	EffectPgUpdateBase<
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

export type EffectPgUpdateJoinFn<
	T extends AnyEffectPgUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
>(
	table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
			"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
		>
		: TJoinedTable,
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
) => EffectPgUpdateJoin<T, TDynamic, TJoinType, TJoinedTable>;

export type EffectPgUpdateJoin<
	T extends AnyEffectPgUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
> = TDynamic extends true ? T : EffectPgUpdateBase<
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
type AccumulateToResult<
	T extends AnyEffectPgUpdate,
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

export type EffectPgUpdateReturningAll<T extends AnyEffectPgUpdate, TDynamic extends boolean> = EffectPgUpdateWithout<
	EffectPgUpdateBase<
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

export type EffectPgUpdateReturning<
	T extends AnyEffectPgUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = EffectPgUpdateWithout<
	EffectPgUpdateBase<
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

export type EffectPgUpdatePrepare<T extends AnyEffectPgUpdate> = EffectPgCorePreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type EffectPgUpdateDynamic<T extends AnyEffectPgUpdate> = EffectPgUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['returning'],
	T['_']['nullabilityMap']
>;

export type EffectPgUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = EffectPgUpdateBase<TTable, TQueryResult, TFrom, TSelectedFields, TReturning, TNullabilityMap, TJoins, true, never>;

export type AnyEffectPgUpdate = EffectPgUpdateBase<any, any, any, any, any, any, any, any, any>;

export interface EffectPgUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	EffectWrapper<
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
		DrizzleQueryError
	>,
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
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class EffectPgUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
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
> extends EffectWrapper<
	TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
	DrizzleQueryError
> implements
	RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
	SQLWrapper
{
	static override readonly [entityKind]: string = 'EffectPgUpdate';

	private config: PgUpdateConfig;
	private tableName: string | undefined;
	private joinsNotNullableMap: Record<string, boolean>;
	protected cacheConfig?: WithCacheConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: EffectPgCoreSession,
		private dialect: PgDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { set, table, withList, joins: [] };
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	from<TFrom extends PgTable | Subquery | PgViewBase | SQL>(
		source: TableLikeHasEmptySelection<TFrom> extends true ? DrizzleTypeError<
				"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
			>
			: TFrom,
	): EffectPgUpdateWithJoins<this, TDynamic, TFrom> {
		const src = source as TFrom;
		const tableName = getTableLikeName(src);
		if (typeof tableName === 'string') {
			this.joinsNotNullableMap[tableName] = true;
		}
		this.config.from = src;
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
	): EffectPgUpdateJoinFn<this, TDynamic, TJoinType> {
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
	 * yield* db.update(cars).set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'));
	 * // or
	 * yield* db.update(cars).set({ color: 'red' })
	 *   .where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Update all BMW cars with a green color
	 * yield* db.update(cars).set({ color: 'red' })
	 *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Update all cars with the green or blue color
	 * yield* db.update(cars).set({ color: 'red' })
	 *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): EffectPgUpdateWithout<this, TDynamic, 'where'> {
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
	 * const updatedCars: Car[] = yield* db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'))
	 *   .returning();
	 *
	 * // Update all cars with the green color and return only their id and brand fields
	 * const updatedCarsIdsAndBrands: { id: number, brand: string }[] = yield* db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'))
	 *   .returning({ id: cars.id, brand: cars.brand });
	 * ```
	 */
	returning(): EffectPgUpdateReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): EffectPgUpdateReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields?: SelectedFields,
	): EffectPgUpdateWithout<AnyEffectPgUpdate, TDynamic, 'returning'> {
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
	_prepare(name?: string): EffectPgUpdatePrepare<this> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TReturning[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'insert',
			tables: extractUsedTable(this.config.table),
		}, this.cacheConfig);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}

	prepare(name: string): EffectPgUpdatePrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
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

	$dynamic(): EffectPgUpdateDynamic<this> {
		return this as any;
	}
}
