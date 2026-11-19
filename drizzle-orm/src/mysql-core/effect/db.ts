import type * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { WithSubquery } from '~/subquery.ts';
import type { InferInsertModel, RequiredInsertKeys } from '~/table.ts';
import type { DrizzleTypeError, IsNever, JoinUnion } from '~/utils.ts';
import { MySqlDatabase, type MySqlDatabaseBuilders } from '../db.ts';
import type { MySqlInsertBuilder, NoDuplicateColumns } from '../query-builders/insert.ts';
import type { RelationalQueryBuilder } from '../query-builders/query.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { MySqlUpdateBuilder } from '../query-builders/update.ts';
import type { MySqlQueryResultHKT, MySqlQueryResultKind } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';
import { MySqlEffectCountBuilder } from './count.ts';
import { MySqlEffectDeleteBase } from './delete.ts';
import { MySqlEffectInsertBase, type MySqlEffectInsertHKT } from './insert.ts';
import { MySqlEffectRelationalQuery, type MySqlEffectRelationalQueryHKT } from './query.ts';
import { MySqlEffectRaw } from './raw.ts';
import { MySqlEffectSelectBase, type MySqlEffectSelectBuilder } from './select.ts';
import type { MySqlEffectSession, MySqlEffectTransaction } from './session.ts';
import { MySqlEffectUpdateBase, type MySqlEffectUpdateHKT } from './update.ts';

const mysqlEffectBuilders: MySqlDatabaseBuilders = {
	select: MySqlEffectSelectBase,
	insert: MySqlEffectInsertBase,
	update: MySqlEffectUpdateBase,
	delete: MySqlEffectDeleteBase,
	count: MySqlEffectCountBuilder,
	raw: MySqlEffectRaw,
	relationalQuery: MySqlEffectRelationalQuery,
};

/** The query builders of {@link MySqlEffectDatabase.with}: they run with it's CTEs */
export type MySqlEffectWithBuilders<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT,
> = Pick<
	MySqlEffectDatabase<TEffectHKT, TQueryResult, any>,
	'select' | 'selectDistinct' | 'update' | 'delete'
>;

export interface MySqlEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> {
	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TRelations,
			TRelations[K],
			MySqlEffectRelationalQueryHKT<TEffectHKT>
		>;
	};

	$count(
		source: MySqlTable | MySqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): MySqlEffectCountBuilder<TEffectHKT>;

	/**
	 * Incorporates a previously defined CTE (using `$with`) into the main query.
	 *
	 * This method allows the main query to reference a temporary named result set.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param queries The CTEs to incorporate into the main query.
	 *
	 * @example
	 *
	 * ```ts
	 * // Define a subquery 'sq' as a CTE using $with
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * // Incorporate the CTE 'sq' into the main query and select from it
	 * const result = yield* db.with(sq).select().from(sq);
	 * ```
	 */
	with(...queries: WithSubquery[]): MySqlEffectWithBuilders<TEffectHKT, TQueryResult>;

	/**
	 * Creates a select query.
	 *
	 * Calling this method with no arguments will select all columns from the table. Pass a selection object to specify the columns you want to select.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all columns and all rows from the 'cars' table
	 * const allCars: Car[] = yield* db.select().from(cars);
	 *
	 * // Select specific columns and all rows from the 'cars' table
	 * const carsIdsAndBrands: { id: number; brand: string }[] = yield* db.select({
	 *   id: cars.id,
	 *   brand: cars.brand
	 * })
	 *   .from(cars);
	 * ```
	 *
	 * Like in SQL, you can use arbitrary expressions as selection fields, not just table columns:
	 *
	 * ```ts
	 * // Select specific columns along with expression and all rows from the 'cars' table
	 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = yield* db.select({
	 *   id: cars.id,
	 *   lowerBrand: sql<string>`lower(${cars.brand})`,
	 * })
	 *   .from(cars);
	 * ```
	 */
	select(): MySqlEffectSelectBuilder<undefined, TEffectHKT>;

	select<TSelection extends SelectedFields>(fields: TSelection): MySqlEffectSelectBuilder<TSelection, TEffectHKT>;

	/**
	 * Adds `distinct` expression to the select query.
	 *
	 * Calling this method will return only unique values. When multiple columns are selected, it returns rows with unique combinations of values in these columns.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 * ```ts
	 * // Select all unique rows from the 'cars' table
	 * yield* db.selectDistinct()
	 *   .from(cars)
	 *   .orderBy(cars.id, cars.brand, cars.color);
	 *
	 * // Select all unique brands from the 'cars' table
	 * yield* db.selectDistinct({ brand: cars.brand })
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 * ```
	 */
	selectDistinct(): MySqlEffectSelectBuilder<undefined, TEffectHKT>;

	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): MySqlEffectSelectBuilder<TSelection, TEffectHKT>;

	/**
	 * Creates an update query.
	 *
	 * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
	 *
	 * Use `.set()` method to specify which values to update.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update}
	 *
	 * @param table The table to update.
	 *
	 * @example
	 *
	 * ```ts
	 * // Update all rows in the 'cars' table
	 * yield* db.update(cars).set({ color: 'red' });
	 *
	 * // Update rows with filters and conditions
	 * yield* db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
	 * ```
	 */
	update<TTable extends MySqlTable>(
		table: TTable,
	): MySqlUpdateBuilder<TTable, TQueryResult, MySqlEffectUpdateHKT<TEffectHKT>>;

	/**
	 * Creates an insert query.
	 *
	 * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/insert}
	 *
	 * @param table The table to insert into.
	 *
	 * @example
	 *
	 * ```ts
	 * // Insert one row
	 * yield* db.insert(cars).values({ brand: 'BMW' });
	 *
	 * // Insert multiple rows
	 * yield* db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	 *
	 * // Insert only selected columns
	 * yield* db.insert(cars, 'brand', 'productionYear').values([{ brand: 'BMW', productionYear: 1995 }, { brand: 'Porsche', productionYear: 1989 }]);
	 * ```
	 */
	insert<
		TTable extends MySqlTable,
		TColumnList extends (keyof InferInsertModel<TTable>)[] = [],
		TRequiredKeys extends string = RequiredInsertKeys<TTable>,
	>(
		table: TTable,
		...columns: TColumnList extends [] ? []
			: IsNever<TRequiredKeys> extends true ? TColumnList & NoDuplicateColumns<TColumnList>
			: [TRequiredKeys] extends [TColumnList[number]] ? TColumnList & NoDuplicateColumns<TColumnList>
			: DrizzleTypeError<
				`Column selection is missing following required columns: ${JoinUnion<
					`"${Exclude<TRequiredKeys, TColumnList[number]>}"`,
					', '
				>}`
			>[]
	): MySqlInsertBuilder<
		TTable,
		TQueryResult,
		TColumnList extends [] ? 'all' : TColumnList,
		MySqlEffectInsertHKT<TEffectHKT>
	>;

	/**
	 * Creates a delete query.
	 *
	 * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 *
	 * @param table The table to delete from.
	 *
	 * @example
	 *
	 * ```ts
	 * // Delete all rows in the 'cars' table
	 * yield* db.delete(cars);
	 *
	 * // Delete rows with filters and conditions
	 * yield* db.delete(cars).where(eq(cars.color, 'green'));
	 * ```
	 */
	delete<TTable extends MySqlTable>(
		table: TTable,
	): MySqlEffectDeleteBase<TTable, TQueryResult, false, never, TEffectHKT>;

	/**
	 * Executes raw SQL query, responding with rows as arrays of values
	 *
	 * Types assume single statement is executed per query
	 *
	 * @param query - SQL query to execute
	 * @param mode - `'arrays'`
	 *
	 * @example
	 * ```ts
	 * // [number, string][]
	 * const rows = yield* db.execute<[number, string]>(sql`select ${users.id}, ${users.name} from ${users}`, 'arrays');
	 * ```
	 */
	execute<TRow extends unknown[] = unknown[]>(
		query: SQLWrapper | string,
		mode: 'arrays',
	): MySqlEffectRaw<TRow[], TEffectHKT>;

	/**
	 * Executes raw SQL query, responding with rows as objects
	 *
	 * Types assume single statement is executed per query
	 *
	 * @param query - SQL query to execute
	 * @param mode - `'objects'`
	 *
	 * @example
	 * ```ts
	 * // { id: number; name: string }[]
	 * const rows = yield* db.execute<{ id: number; name: string }>(sql`select ${users.id}, ${users.name} from ${users}`, 'objects');
	 * ```
	 */
	execute<TRow extends Record<string, any> = Record<string, unknown>>(
		query: SQLWrapper | string,
		mode: 'objects',
	): MySqlEffectRaw<TRow[], TEffectHKT>;

	/**
	 * Executes raw SQL query, returning driver's raw response
	 *
	 * Row type argument defines the type of the response:
	 * - `'unknown'` (default) - any response of the driver
	 * - `never` - response of a statement that returns no rows
	 * - object shape - response with rows of given shape
	 *
	 * Typed call assumes single statement is executed per query
	 *
	 * @param query - SQL query to execute
	 * @param mode - `'raw'` (default)
	 *
	 * @example
	 * ```ts
	 * // Any response of the driver
	 * const response = yield* db.execute(sql`select * from ${users}`);
	 *
	 * // Response of a statement that returns no rows
	 * const updated = yield* db.execute<never>(sql`update ${users} set ${users.name} = ${'John'}`);
	 *
	 * // Response with rows of given shape
	 * const selected = yield* db.execute<{ id: number; name: string }>(sql`select ${users.id}, ${users.name} from ${users}`);
	 * ```
	 */
	execute<TRow extends Record<string, any> | 'unknown' = 'unknown'>(
		query: SQLWrapper | string,
		mode?: 'raw' | undefined,
	): MySqlEffectRaw<MySqlQueryResultKind<TQueryResult, TRow>, TEffectHKT>;
}

export class MySqlEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'MySqlEffectDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: MySqlEffectSession<TEffectHKT, TQueryResult, TRelations>;
	};

	/** @internal */
	declare readonly session: MySqlEffectSession<TEffectHKT, any, any>;

	constructor(
		/** @internal */
		dialect: MySqlDialect,
		/** @internal */
		session: MySqlEffectSession<TEffectHKT, any, any>,
		relations: TRelations,
	) {
		super(mysqlEffectBuilders, dialect, session, relations);
	}

	transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}

export type MySqlEffectWithReplicas<Q> = Q & {
	$replica: Q;
	/**
	 * @deprecated `withReplicas` db now defaults to using primary
	 *
	 * Use `db.$replica` to redirect query to replica
	 */
	$primary: Q;
	$replicas: Q[];
};

export const withReplicas = <
	TEffectHKT extends QueryEffectHKTBase,
	HKT extends MySqlQueryResultHKT,
	TRelations extends AnyRelations,
	Q extends MySqlEffectDatabase<TEffectHKT, HKT, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): MySqlEffectWithReplicas<Q> => {
	return Object.create(primary, {
		$replica: { get: () => getReplica(replicas) },
		$primary: { value: primary },
		$replicas: { value: replicas },
	});
};
