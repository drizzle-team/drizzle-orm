import type { CacheConfig, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
	SetOperator,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { SingleStoreColumn } from '~/singlestore-core/columns/index.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type {
	PreparedQueryHKTBase,
	SingleStorePreparedQueryConfig,
	SingleStoreSession,
} from '~/singlestore-core/session.ts';
import type { SubqueryWithSelection } from '~/singlestore-core/subquery.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import type { ColumnsSelection, Query } from '~/sql/sql.ts';
import { SQL } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import {
	applyMixins,
	getTableColumns,
	getTableLikeName,
	haveSameKeys,
	orderSelectedFields,
	type ValueOrArray,
} from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type {
	AnySingleStoreSelect,
	CreateSingleStoreSelectFromBuilderMode,
	GetSingleStoreSetOperators,
	LockConfig,
	LockStrength,
	SelectedFields,
	SetOperatorRightSelect,
	SingleStoreCreateSetOperatorFn,
	SingleStoreCrossJoinFn,
	SingleStoreJoinFn,
	SingleStoreSelectConfig,
	SingleStoreSelectDynamic,
	SingleStoreSelectHKT,
	SingleStoreSelectHKTBase,
	SingleStoreSelectPrepare,
	SingleStoreSelectWithout,
	SingleStoreSetOperatorExcludedMethods,
	SingleStoreSetOperatorWithResult,
} from './select.types.ts';

export class SingleStoreSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	static readonly [entityKind]: string = 'SingleStoreSelectBuilder';

	private fields: TSelection;
	private session: SingleStoreSession | undefined;
	private dialect: SingleStoreDialect;
	private withList: Subquery[] = [];
	private distinct: boolean | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: SingleStoreSession | undefined;
			dialect: SingleStoreDialect;
			withList?: Subquery[];
			distinct?: boolean;
		},
	) {
		this.fields = config.fields;
		this.session = config.session;
		this.dialect = config.dialect;
		if (config.withList) {
			this.withList = config.withList;
		}
		this.distinct = config.distinct;
	}

	from<TFrom extends SingleStoreTable | Subquery | SQL>( // | SingleStoreViewBase
		source: TFrom,
	): CreateSingleStoreSelectFromBuilderMode<
		TBuilderMode,
		GetSelectTableName<TFrom>,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial',
		TPreparedQueryHKT
	> {
		const isPartialSelect = !!this.fields;

		let fields: SelectedFields;
		if (this.fields) {
			fields = this.fields;
		} else if (is(source, Subquery)) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source._.selectedFields).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectedFields[string]]),
			);
			/* } else if (is(source, SingleStoreViewBase)) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields; */
		} else if (is(source, SQL)) {
			fields = {};
		} else {
			fields = getTableColumns<SingleStoreTable>(source);
		}

		return new SingleStoreSelectBase(
			{
				table: source,
				fields,
				isPartialSelect,
				session: this.session,
				dialect: this.dialect,
				withList: this.withList,
				distinct: this.distinct,
			},
		) as any;
	}
}

export abstract class SingleStoreSelectQueryBuilderBase<
	THKT extends SingleStoreSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends TypedQueryBuilder<TSelectedFields, TResult> {
	static override readonly [entityKind]: string = 'SingleStoreSelectQueryBuilder';

	override readonly _: {
		readonly hkt: THKT;
		readonly tableName: TTableName;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
		readonly config: SingleStoreSelectConfig;
	};

	protected config: SingleStoreSelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;
	private isPartialSelect: boolean;
	/** @internal */
	readonly session: SingleStoreSession | undefined;
	protected dialect: SingleStoreDialect;
	protected cacheConfig?: WithCacheConfig = undefined;
	protected usedTables: Set<string> = new Set();

	constructor(
		{ table, fields, isPartialSelect, session, dialect, withList, distinct }: {
			table: SingleStoreSelectConfig['table'];
			fields: SingleStoreSelectConfig['fields'];
			isPartialSelect: boolean;
			session: SingleStoreSession | undefined;
			dialect: SingleStoreDialect;
			withList: Subquery[];
			distinct: boolean | undefined;
		},
	) {
		super();
		this.config = {
			withList,
			table,
			fields: { ...fields },
			distinct,
			setOperators: [],
		};
		this.isPartialSelect = isPartialSelect;
		this.session = session;
		this.dialect = dialect;
		this._ = {
			selectedFields: fields as TSelectedFields,
			config: this.config,
		} as this['_'];
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
		for (const item of extractUsedTable(table)) this.usedTables.add(item);
	}

	/** @internal */
	getUsedTables() {
		return [...this.usedTables];
	}

	private createJoin<
		TJoinType extends JoinType,
		TIsLateral extends (TJoinType extends 'full' | 'right' ? false : boolean),
	>(
		joinType: TJoinType,
		lateral: TIsLateral,
	): 'cross' extends TJoinType ? SingleStoreCrossJoinFn<this, TDynamic, TIsLateral>
		: SingleStoreJoinFn<this, TDynamic, TJoinType, TIsLateral>
	{
		return (
			table: SingleStoreTable | Subquery | SQL, // | SingleStoreViewBase
			on?: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const baseTableName = this.tableName;
			const tableName = getTableLikeName(table);

			// store all tables used in a query
			for (const item of extractUsedTable(table)) this.usedTables.add(item);

			if (typeof tableName === 'string' && this.config.joins?.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select and we're not selecting from raw SQL, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === 'string') {
					this.config.fields = {
						[baseTableName]: this.config.fields,
					};
				}
				if (typeof tableName === 'string' && !is(table, SQL)) {
					const selection = is(table, Subquery)
						? table._.selectedFields
						/* : is(table, View)
						? table[ViewBaseConfig].selectedFields */
						: table[Table.Symbol.Columns];
					this.config.fields[tableName] = selection;
				}
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			if (!this.config.joins) {
				this.config.joins = [];
			}

			this.config.joins.push({ on, table, joinType, alias: tableName, lateral });

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
					case 'cross':
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
		};
	}

	/**
	 * Executes a `left join` operation by adding another table to the current query.
	 *
	 * Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#left-join}
	 *
	 * @param table the table to join.
	 * @param on the `on` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all users and their pets
	 * const usersWithPets: { user: User; pets: Pet | null; }[] = await db.select()
	 *   .from(users)
	 *   .leftJoin(pets, eq(users.id, pets.ownerId))
	 *
	 * // Select userId and petId
	 * const usersIdsAndPetIds: { userId: number; petId: number | null; }[] = await db.select({
	 *   userId: users.id,
	 *   petId: pets.id,
	 * })
	 *   .from(users)
	 *   .leftJoin(pets, eq(users.id, pets.ownerId))
	 * ```
	 */
	leftJoin = this.createJoin('left', false);

	/**
	 * Executes a `left join lateral` operation by adding subquery to the current query.
	 *
	 * A `lateral` join allows the right-hand expression to refer to columns from the left-hand side.
	 *
	 * Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#left-join-lateral}
	 *
	 * @param table the subquery to join.
	 * @param on the `on` clause.
	 */
	leftJoinLateral = this.createJoin('left', true);

	/**
	 * Executes a `right join` operation by adding another table to the current query.
	 *
	 * Calling this method associates each row of the joined table with the corresponding row from the main table, if a match is found. If no matching row exists, it sets all columns of the main table to null.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#right-join}
	 *
	 * @param table the table to join.
	 * @param on the `on` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all users and their pets
	 * const usersWithPets: { user: User | null; pets: Pet; }[] = await db.select()
	 *   .from(users)
	 *   .rightJoin(pets, eq(users.id, pets.ownerId))
	 *
	 * // Select userId and petId
	 * const usersIdsAndPetIds: { userId: number | null; petId: number; }[] = await db.select({
	 *   userId: users.id,
	 *   petId: pets.id,
	 * })
	 *   .from(users)
	 *   .rightJoin(pets, eq(users.id, pets.ownerId))
	 * ```
	 */
	rightJoin = this.createJoin('right', false);

	/**
	 * Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
	 *
	 * Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#inner-join}
	 *
	 * @param table the table to join.
	 * @param on the `on` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all users and their pets
	 * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
	 *   .from(users)
	 *   .innerJoin(pets, eq(users.id, pets.ownerId))
	 *
	 * // Select userId and petId
	 * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
	 *   userId: users.id,
	 *   petId: pets.id,
	 * })
	 *   .from(users)
	 *   .innerJoin(pets, eq(users.id, pets.ownerId))
	 * ```
	 */
	innerJoin = this.createJoin('inner', false);

	/**
	 * Executes an `inner join lateral` operation, creating a new table by combining rows from two queries that have matching values.
	 *
	 * A `lateral` join allows the right-hand expression to refer to columns from the left-hand side.
	 *
	 * Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#inner-join-lateral}
	 *
	 * @param table the subquery to join.
	 * @param on the `on` clause.
	 */
	innerJoinLateral = this.createJoin('inner', true);

	/**
	 * Executes a `full join` operation by combining rows from two tables into a new table.
	 *
	 * Calling this method retrieves all rows from both main and joined tables, merging rows with matching values and filling in `null` for non-matching columns.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#full-join}
	 *
	 * @param table the table to join.
	 * @param on the `on` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all users and their pets
	 * const usersWithPets: { user: User | null; pets: Pet | null; }[] = await db.select()
	 *   .from(users)
	 *   .fullJoin(pets, eq(users.id, pets.ownerId))
	 *
	 * // Select userId and petId
	 * const usersIdsAndPetIds: { userId: number | null; petId: number | null; }[] = await db.select({
	 *   userId: users.id,
	 *   petId: pets.id,
	 * })
	 *   .from(users)
	 *   .fullJoin(pets, eq(users.id, pets.ownerId))
	 * ```
	 */
	fullJoin = this.createJoin('full', false);

	/**
	 * Executes a `cross join` operation by combining rows from two tables into a new table.
	 *
	 * Calling this method retrieves all rows from both main and joined tables, merging all rows from each table.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#cross-join}
	 *
	 * @param table the table to join.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all users, each user with every pet
	 * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
	 *   .from(users)
	 *   .crossJoin(pets)
	 *
	 * // Select userId and petId
	 * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
	 *   userId: users.id,
	 *   petId: pets.id,
	 * })
	 *   .from(users)
	 *   .crossJoin(pets)
	 * ```
	 */
	crossJoin = this.createJoin('cross', false);

	/**
	 * Executes a `cross join lateral` operation by combining rows from two queries into a new table.
	 *
	 * A `lateral` join allows the right-hand expression to refer to columns from the left-hand side.
	 *
	 * Calling this method retrieves all rows from both main and joined queries, merging all rows from each query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/joins#cross-join-lateral}
	 *
	 * @param table the query to join.
	 */
	crossJoinLateral = this.createJoin('cross', true);

	private createSetOperator(
		type: SetOperator,
		isAll: boolean,
	): <TValue extends SingleStoreSetOperatorWithResult<TResult>>(
		rightSelection:
			| ((setOperators: GetSingleStoreSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => SingleStoreSelectWithout<
		this,
		TDynamic,
		SingleStoreSetOperatorExcludedMethods,
		true
	> {
		return (rightSelection) => {
			const rightSelect = (typeof rightSelection === 'function'
				? rightSelection(getSingleStoreSetOperators())
				: rightSelection) as TypedQueryBuilder<
					any,
					TResult
				>;

			if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
				throw new Error(
					'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
				);
			}

			this.config.setOperators.push({ type, isAll, rightSelect });
			return this as any;
		};
	}

	/**
	 * Adds `union` set operator to the query.
	 *
	 * Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all unique names from customers and users tables
	 * await db.select({ name: users.name })
	 *   .from(users)
	 *   .union(
	 *     db.select({ name: customers.name }).from(customers)
	 *   );
	 * // or
	 * import { union } from 'drizzle-orm/singlestore-core'
	 *
	 * await union(
	 *   db.select({ name: users.name }).from(users),
	 *   db.select({ name: customers.name }).from(customers)
	 * );
	 * ```
	 */
	union = this.createSetOperator('union', false);

	/**
	 * Adds `union all` set operator to the query.
	 *
	 * Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all transaction ids from both online and in-store sales
	 * await db.select({ transaction: onlineSales.transactionId })
	 *   .from(onlineSales)
	 *   .unionAll(
	 *     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
	 *   );
	 * // or
	 * import { unionAll } from 'drizzle-orm/singlestore-core'
	 *
	 * await unionAll(
	 *   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
	 *   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
	 * );
	 * ```
	 */
	unionAll = this.createSetOperator('union', true);

	/**
	 * Adds `intersect` set operator to the query.
	 *
	 * Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
	 *
	 * @example
	 *
	 * ```ts
	 * // Select course names that are offered in both departments A and B
	 * await db.select({ courseName: depA.courseName })
	 *   .from(depA)
	 *   .intersect(
	 *     db.select({ courseName: depB.courseName }).from(depB)
	 *   );
	 * // or
	 * import { intersect } from 'drizzle-orm/singlestore-core'
	 *
	 * await intersect(
	 *   db.select({ courseName: depA.courseName }).from(depA),
	 *   db.select({ courseName: depB.courseName }).from(depB)
	 * );
	 * ```
	 */
	intersect = this.createSetOperator('intersect', false);

	/**
	 * Adds `except` set operator to the query.
	 *
	 * Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all courses offered in department A but not in department B
	 * await db.select({ courseName: depA.courseName })
	 *   .from(depA)
	 *   .except(
	 *     db.select({ courseName: depB.courseName }).from(depB)
	 *   );
	 * // or
	 * import { except } from 'drizzle-orm/singlestore-core'
	 *
	 * await except(
	 *   db.select({ courseName: depA.courseName }).from(depA),
	 *   db.select({ courseName: depB.courseName }).from(depB)
	 * );
	 * ```
	 */
	except = this.createSetOperator('except', false);

	/**
	 * Adds `minus` set operator to the query.
	 *
	 * This is an alias of `except` supported by SingleStore.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all courses offered in department A but not in department B
	 * await db.select({ courseName: depA.courseName })
	 *   .from(depA)
	 *   .minus(
	 *     db.select({ courseName: depB.courseName }).from(depB)
	 *   );
	 * // or
	 * import { minus } from 'drizzle-orm/singlestore-core'
	 *
	 * await minus(
	 *   db.select({ courseName: depA.courseName }).from(depA),
	 *   db.select({ courseName: depB.courseName }).from(depB)
	 * );
	 * ```
	 */
	minus = this.createSetOperator('except', false);

	/** @internal */
	addSetOperators(setOperators: SingleStoreSelectConfig['setOperators']): SingleStoreSelectWithout<
		this,
		TDynamic,
		SingleStoreSetOperatorExcludedMethods,
		true
	> {
		this.config.setOperators.push(...setOperators);
		return this as any;
	}

	/**
	 * Adds a `where` clause to the query.
	 *
	 * Calling this method will select only those rows that fulfill a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#filtering}
	 *
	 * @param where the `where` clause.
	 *
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be selected.
	 *
	 * ```ts
	 * // Select all cars with green color
	 * await db.select().from(cars).where(eq(cars.color, 'green'));
	 * // or
	 * await db.select().from(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Select all BMW cars with a green color
	 * await db.select().from(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Select all cars with the green or blue color
	 * await db.select().from(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(
		where: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): SingleStoreSelectWithout<this, TDynamic, 'where'> {
		if (typeof where === 'function') {
			where = where(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.where = where;
		return this as any;
	}

	/**
	 * Adds a `having` clause to the query.
	 *
	 * Calling this method will select only those rows that fulfill a specified condition. It is typically used with aggregate functions to filter the aggregated data based on a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
	 *
	 * @param having the `having` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all brands with more than one car
	 * await db.select({
	 * 	brand: cars.brand,
	 * 	count: sql<number>`cast(count(${cars.id}) as int)`,
	 * })
	 *   .from(cars)
	 *   .groupBy(cars.brand)
	 *   .having(({ count }) => gt(count, 1));
	 * ```
	 */
	having(
		having: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): SingleStoreSelectWithout<this, TDynamic, 'having'> {
		if (typeof having === 'function') {
			having = having(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.having = having;
		return this as any;
	}

	/**
	 * Adds a `group by` clause to the query.
	 *
	 * Calling this method will group rows that have the same values into summary rows, often used for aggregation purposes.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
	 *
	 * @example
	 *
	 * ```ts
	 * // Group and count people by their last names
	 * await db.select({
	 *    lastName: people.lastName,
	 *    count: sql<number>`cast(count(*) as int)`
	 * })
	 *   .from(people)
	 *   .groupBy(people.lastName);
	 * ```
	 */
	groupBy(
		builder: (aliases: this['_']['selection']) => ValueOrArray<SingleStoreColumn | SQL | SQL.Aliased>,
	): SingleStoreSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(...columns: (SingleStoreColumn | SQL | SQL.Aliased)[]): SingleStoreSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<SingleStoreColumn | SQL | SQL.Aliased>]
			| (SingleStoreColumn | SQL | SQL.Aliased)[]
	): SingleStoreSelectWithout<this, TDynamic, 'groupBy'> {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.groupBy = columns as (SingleStoreColumn | SQL | SQL.Aliased)[];
		}
		return this as any;
	}

	/**
	 * Adds an `order by` clause to the query.
	 *
	 * Calling this method will sort the result-set in ascending or descending order. By default, the sort order is ascending.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#order-by}
	 *
	 * @example
	 *
	 * ```
	 * // Select cars ordered by year
	 * await db.select().from(cars).orderBy(cars.year);
	 * ```
	 *
	 * You can specify whether results are in ascending or descending order with the `asc()` and `desc()` operators.
	 *
	 * ```ts
	 * // Select cars ordered by year in descending order
	 * await db.select().from(cars).orderBy(desc(cars.year));
	 *
	 * // Select cars ordered by year and price
	 * await db.select().from(cars).orderBy(asc(cars.year), desc(cars.price));
	 * ```
	 */
	orderBy(
		builder: (aliases: this['_']['selection']) => ValueOrArray<SingleStoreColumn | SQL | SQL.Aliased>,
	): SingleStoreSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SingleStoreColumn | SQL | SQL.Aliased)[]): SingleStoreSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<SingleStoreColumn | SQL | SQL.Aliased>]
			| (SingleStoreColumn | SQL | SQL.Aliased)[]
	): SingleStoreSelectWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);

			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

			if (this.config.setOperators.length > 0) {
				this.config.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.orderBy = orderByArray;
			}
		} else {
			const orderByArray = columns as (SingleStoreColumn | SQL | SQL.Aliased)[];

			if (this.config.setOperators.length > 0) {
				this.config.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.orderBy = orderByArray;
			}
		}
		return this as any;
	}

	/**
	 * Adds a `limit` clause to the query.
	 *
	 * Calling this method will set the maximum number of rows that will be returned by this query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
	 *
	 * @param limit the `limit` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Get the first 10 people from this query.
	 * await db.select().from(people).limit(10);
	 * ```
	 */
	limit(limit: number): SingleStoreSelectWithout<this, TDynamic, 'limit'> {
		if (this.config.setOperators.length > 0) {
			this.config.setOperators.at(-1)!.limit = limit;
		} else {
			this.config.limit = limit;
		}
		return this as any;
	}

	/**
	 * Adds an `offset` clause to the query.
	 *
	 * Calling this method will skip a number of rows when returning results from this query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
	 *
	 * @param offset the `offset` clause.
	 *
	 * @example
	 *
	 * ```ts
	 * // Get the 10th-20th people from this query.
	 * await db.select().from(people).offset(10).limit(10);
	 * ```
	 */
	offset(offset: number): SingleStoreSelectWithout<this, TDynamic, 'offset'> {
		if (this.config.setOperators.length > 0) {
			this.config.setOperators.at(-1)!.offset = offset;
		} else {
			this.config.offset = offset;
		}
		return this as any;
	}

	/**
	 * Adds a `for` clause to the query.
	 *
	 * Calling this method will specify a lock strength for this query that controls how strictly it acquires exclusive access to the rows being queried.
	 *
	 * @param strength the lock strength.
	 * @param config the lock configuration.
	 */
	for(strength: LockStrength, config: LockConfig = {}): SingleStoreSelectWithout<this, TDynamic, 'for'> {
		this.config.lockingClause = { strength, config };
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<this['_']['selectedFields'], TAlias> {
		const usedTables: string[] = [];
		usedTables.push(...extractUsedTable(this.config.table));
		if (this.config.joins) { for (const it of this.config.joins) usedTables.push(...extractUsedTable(it.table)); }

		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias, false, [...new Set(usedTables)]),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<this['_']['selectedFields'], TAlias>;
	}

	/** @internal */
	override getSelectedFields(): this['_']['selectedFields'] {
		return new Proxy(
			this.config.fields,
			new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as this['_']['selectedFields'];
	}

	$dynamic(): SingleStoreSelectDynamic<this> {
		return this as any;
	}
}

export interface SingleStoreSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends
	SingleStoreSelectQueryBuilderBase<
		SingleStoreSelectHKT,
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	QueryPromise<TResult>
{}

export class SingleStoreSelectBase<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends SingleStoreSelectQueryBuilderBase<
	SingleStoreSelectHKT,
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'SingleStoreSelect';

	prepare(): SingleStoreSelectPrepare<this> {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const fieldsList = orderSelectedFields<SingleStoreColumn>(this.config.fields);
		const query = this.session.prepareQuery<
			SingleStorePreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[] },
			TPreparedQueryHKT
		>(this.dialect.sqlToQuery(this.getSQL()), fieldsList, undefined, undefined, undefined, {
			type: 'select',
			tables: [...this.usedTables],
		}, this.cacheConfig);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query as SingleStoreSelectPrepare<this>;
	}

	$withCache(config?: { config?: CacheConfig; tag?: string; autoInvalidate?: boolean } | false) {
		this.cacheConfig = config === undefined
			? { config: {}, enabled: true, autoInvalidate: true }
			: config === false
			? { enabled: false }
			: { enabled: true, autoInvalidate: true, ...config };
		return this;
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

applyMixins(SingleStoreSelectBase, [QueryPromise]);

function createSetOperator(type: SetOperator, isAll: boolean): SingleStoreCreateSetOperatorFn {
	return (leftSelect, rightSelect, ...restSelects) => {
		const setOperators = [rightSelect, ...restSelects].map((select) => ({
			type,
			isAll,
			rightSelect: select as AnySingleStoreSelect,
		}));

		for (const setOperator of setOperators) {
			if (!haveSameKeys((leftSelect as any).getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
				throw new Error(
					'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
				);
			}
		}

		return (leftSelect as AnySingleStoreSelect).addSetOperators(setOperators) as any;
	};
}

const getSingleStoreSetOperators = () => ({
	union,
	unionAll,
	intersect,
	except,
	minus,
});

/**
 * Adds `union` set operator to the query.
 *
 * Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
 *
 * See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
 *
 * @example
 *
 * ```ts
 * // Select all unique names from customers and users tables
 * import { union } from 'drizzle-orm/singlestore-core'
 *
 * await union(
 *   db.select({ name: users.name }).from(users),
 *   db.select({ name: customers.name }).from(customers)
 * );
 * // or
 * await db.select({ name: users.name })
 *   .from(users)
 *   .union(
 *     db.select({ name: customers.name }).from(customers)
 *   );
 * ```
 */
export const union = createSetOperator('union', false);

/**
 * Adds `union all` set operator to the query.
 *
 * Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
 *
 * See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
 *
 * @example
 *
 * ```ts
 * // Select all transaction ids from both online and in-store sales
 * import { unionAll } from 'drizzle-orm/singlestore-core'
 *
 * await unionAll(
 *   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
 *   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
 * );
 * // or
 * await db.select({ transaction: onlineSales.transactionId })
 *   .from(onlineSales)
 *   .unionAll(
 *     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
 *   );
 * ```
 */
export const unionAll = createSetOperator('union', true);

/**
 * Adds `intersect` set operator to the query.
 *
 * Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
 *
 * See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
 *
 * @example
 *
 * ```ts
 * // Select course names that are offered in both departments A and B
 * import { intersect } from 'drizzle-orm/singlestore-core'
 *
 * await intersect(
 *   db.select({ courseName: depA.courseName }).from(depA),
 *   db.select({ courseName: depB.courseName }).from(depB)
 * );
 * // or
 * await db.select({ courseName: depA.courseName })
 *   .from(depA)
 *   .intersect(
 *     db.select({ courseName: depB.courseName }).from(depB)
 *   );
 * ```
 */
export const intersect = createSetOperator('intersect', false);

/**
 * Adds `except` set operator to the query.
 *
 * Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
 *
 * See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
 *
 * @example
 *
 * ```ts
 * // Select all courses offered in department A but not in department B
 * import { except } from 'drizzle-orm/singlestore-core'
 *
 * await except(
 *   db.select({ courseName: depA.courseName }).from(depA),
 *   db.select({ courseName: depB.courseName }).from(depB)
 * );
 * // or
 * await db.select({ courseName: depA.courseName })
 *   .from(depA)
 *   .except(
 *     db.select({ courseName: depB.courseName }).from(depB)
 *   );
 * ```
 */
export const except = createSetOperator('except', false);

/**
 * Adds `minus` set operator to the query.
 *
 * This is an alias of `except` supported by SingleStore.
 *
 * @example
 *
 * ```ts
 * // Select all courses offered in department A but not in department B
 * import { minus } from 'drizzle-orm/singlestore-core'
 *
 * await minus(
 *   db.select({ courseName: depA.courseName }).from(depA),
 *   db.select({ courseName: depB.courseName }).from(depB)
 * );
 * // or
 * await db.select({ courseName: depA.courseName })
 *   .from(depA)
 *   .minus(
 *     db.select({ courseName: depB.courseName }).from(depB)
 *   );
 * ```
 */
export const minus = createSetOperator('except', true);
