import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PgSession } from '~/pg-core/session.ts';
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
import type { PgColumn } from '../columns/common.ts';
import type { PgViewBase } from '../view-base.ts';
import type {
	PgSelectJoinConfig,
	SelectedFields,
	SelectedFieldsOrdered,
	TableLikeHasEmptySelection,
} from './select.types.ts';

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

export type PgUpdateSetSource<
	TTable extends PgTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[Key in keyof TModel & string]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL
			| PgColumn
			| undefined;
	}
	& {};

export interface PgUpdateBuilderConstructor {
	new(
		table: PgTable,
		set: UpdateSet,
		session: PgSession,
		dialect: PgDialect,
		withList?: Subquery[],
	): AnyPgUpdate;
}

export class PgUpdateBuilder<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TBuilderHKT extends PgUpdateHKTBase = PgUpdateHKT,
> {
	static readonly [entityKind]: string = 'PgUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
		private withList?: Subquery[],
		private builder: PgUpdateBuilderConstructor = PgUpdateBase,
	) {}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	set(
		values: PgUpdateSetSource<TTable>,
	): PgUpdateWithout<
		Assume<PgUpdateKind<TBuilderHKT, TTable, TQueryResult>, AnyPgUpdate>,
		false,
		'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'
	> {
		const builder = new this.builder(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		) as AnyPgUpdate;

		if ('setToken' in builder) {
			(builder.setToken as (authToken?: NeonAuthToken) => typeof builder)(this.authToken);
		}

		return builder as any;
	}
}

export type PgUpdateWithout<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	PgUpdateKind<
		T['_']['hkt'],
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

export type PgUpdateWithJoins<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TFrom extends PgTable | Subquery | PgViewBase | SQL,
> = Omit<
	PgUpdateKind<
		T['_']['hkt'],
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
		TDynamic extends true ? never
			: Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
	>,
	TDynamic extends true ? never
		: Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
>;

export type PgUpdateJoinFn<
	T extends AnyPgUpdate,
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
) => PgUpdateJoin<T, TDynamic, TJoinType, TJoinedTable>;

export type PgUpdateJoin<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
> = Omit<
	PgUpdateKind<
		T['_']['hkt'],
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
		TDynamic extends true ? never : T['_']['excludedMethods']
	>,
	TDynamic extends true ? never : T['_']['excludedMethods']
>;

export type Join = {
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

export type PgUpdateReturningAll<T extends AnyPgUpdate, TDynamic extends boolean> = T extends any ? PgUpdateWithout<
		PgUpdateKind<
			T['_']['hkt'],
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
	>
	: never;

export type PgUpdateReturning<
	T extends AnyPgUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = T extends any ? PgUpdateWithout<
		PgUpdateKind<
			T['_']['hkt'],
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
	>
	: never;

export type PgUpdateDynamic<T extends AnyPgUpdate> = PgUpdateKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['from'],
	T['_']['selectedFields'],
	T['_']['returning'],
	T['_']['nullabilityMap'],
	T['_']['joins'],
	true,
	never
>;

export type PgUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = PgUpdateBase<
	PgUpdateHKT,
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

export interface PgUpdateHKTBase {
	table: unknown;
	joins: unknown;
	nullabilityMap: unknown;
	queryResult: unknown;
	from: unknown;
	selectedFields: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	_type: unknown;
}

export interface PgUpdateHKT extends PgUpdateHKTBase {
	_type: PgUpdateBase<
		PgUpdateHKT,
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['from'], PgTable | Subquery | PgViewBase | SQL | undefined>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		Assume<this['joins'], Join[]>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type PgUpdateKind<
	T extends PgUpdateHKTBase,
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	joins: TJoins;
	nullabilityMap: TNullabilityMap;
	queryResult: TQueryResult;
	from: TFrom;
	selectedFields: TSelectedFields;
	returning: TReturning;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
})['_type'];

export type AnyPgUpdate = PgUpdateBase<any, any, any, any, any, any, any, any, any, any>;

export interface PgUpdateBase<
	THKT extends PgUpdateHKTBase,
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
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly hkt: THKT;
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

export class PgUpdateBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends PgUpdateHKTBase,
	TTable extends PgTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'PgUpdate';

	protected config: PgUpdateConfig;
	protected tableName: string | undefined;
	protected joinsNotNullableMap: Record<string, boolean>;
	protected cacheConfig?: WithCacheConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		protected session: PgSession,
		protected dialect: PgDialect,
		withList?: Subquery[],
	) {
		this.config = { set, table, withList, joins: [] };
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	from<TFrom extends PgTable | Subquery | PgViewBase | SQL>(
		source: TableLikeHasEmptySelection<TFrom> extends true ? DrizzleTypeError<
				"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
			>
			: TFrom,
	): PgUpdateWithJoins<this, TDynamic, TFrom> {
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
	): PgUpdateReturningAll<this, TDynamic> | PgUpdateReturning<this, TDynamic, SelectedFields> {
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

	$dynamic(): PgUpdateDynamic<this> {
		return this as any;
	}
}
