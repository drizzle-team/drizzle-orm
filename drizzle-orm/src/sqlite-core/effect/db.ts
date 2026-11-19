import type { Effect } from 'effect';
import type { SqlError } from 'effect/sql/SqlError';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectCountBuilder } from '~/sqlite-core/effect/count.ts';
import { SQLiteEffectDeleteBase } from '~/sqlite-core/effect/delete.ts';
import { SQLiteEffectInsertBase, type SQLiteEffectInsertBuilder } from '~/sqlite-core/effect/insert.ts';
import { SQLiteEffectRelationalQuery, type SQLiteEffectRelationalQueryHKT } from '~/sqlite-core/effect/query.ts';
import { SQLiteEffectRaw } from '~/sqlite-core/effect/raw.ts';
import { SQLiteEffectSelectBase, type SQLiteEffectSelectBuilder } from '~/sqlite-core/effect/select.ts';
import { SQLiteEffectUpdateBase, type SQLiteEffectUpdateBuilder } from '~/sqlite-core/effect/update.ts';
import type { NoDuplicateColumns } from '~/sqlite-core/query-builders/insert.ts';
import type { RelationalQueryBuilder } from '~/sqlite-core/query-builders/query.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { WithSubquery } from '~/subquery.ts';
import type { InferInsertModel, RequiredInsertKeys } from '~/table.ts';
import type { DrizzleTypeError, IsNever, JoinUnion } from '~/utils.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { SQLiteViewBase } from '../view-base.ts';
import type { SQLiteEffectSession, SQLiteEffectTransaction } from './session.ts';

import { SQLiteDatabase, type SQLiteDatabaseBuilders } from '../db.ts';

const sqliteEffectBuilders: SQLiteDatabaseBuilders = {
	select: SQLiteEffectSelectBase,
	insert: SQLiteEffectInsertBase,
	update: SQLiteEffectUpdateBase,
	delete: SQLiteEffectDeleteBase,
	count: SQLiteEffectCountBuilder,
	raw: SQLiteEffectRaw,
	relationalQuery: SQLiteEffectRelationalQuery,
};

/** The query builders of {@link SQLiteEffectDatabase.with}: they run with it's CTEs */
export type SQLiteEffectWithBuilders<TEffectHKT extends QueryEffectHKTBase, TRunResult> = Pick<
	SQLiteEffectDatabase<TEffectHKT, TRunResult, any>,
	'select' | 'selectDistinct' | 'update' | 'insert' | 'delete'
>;

export interface SQLiteEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			unknown,
			TRelations,
			TRelations[K],
			SQLiteEffectRelationalQueryHKT<TEffectHKT>
		>;
	};

	$count(
		source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQLiteEffectCountBuilder<TEffectHKT>;

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
	with(...queries: WithSubquery[]): SQLiteEffectWithBuilders<TEffectHKT, TRunResult>;

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
	select(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;

	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;

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
	 *
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
	selectDistinct(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;

	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;

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
	 *
	 * // Update with returning clause
	 * const updatedCar: Car[] = yield* db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	update<TTable extends SQLiteTable>(
		table: TTable,
	): SQLiteEffectUpdateBuilder<TTable, TRunResult, TEffectHKT>;

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
	 *
	 * // Insert with returning clause
	 * const insertedCar: Car[] = yield* db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning();
	 * ```
	 */
	insert<
		TTable extends SQLiteTable,
		TColumnList extends (keyof InferInsertModel<TTable>)[] = [],
		TRequiredKeys extends string = RequiredInsertKeys<TTable>,
	>(
		into: TTable,
		...columns: TColumnList extends [] ? []
			: IsNever<TRequiredKeys> extends true ? TColumnList & NoDuplicateColumns<TColumnList>
			: [TRequiredKeys] extends [TColumnList[number]] ? TColumnList & NoDuplicateColumns<TColumnList>
			: DrizzleTypeError<
				`Column selection is missing following required columns: ${JoinUnion<
					`"${Exclude<TRequiredKeys, TColumnList[number]>}"`,
					', '
				>}`
			>[]
	): SQLiteEffectInsertBuilder<TTable, TRunResult, TEffectHKT, TColumnList extends [] ? 'all' : TColumnList>;

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
	 *
	 * // Delete with returning clause
	 * const deletedCar: Car[] = yield* db.delete(cars)
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	delete<TTable extends SQLiteTable>(
		from: TTable,
	): SQLiteEffectDeleteBase<TTable, TRunResult, undefined, false, never, TEffectHKT>;

	run(query: SQLWrapper | string): SQLiteEffectRaw<TRunResult, TEffectHKT>;

	all<TRow extends unknown[] = unknown[]>(
		query: SQLWrapper | string,
		mode: 'arrays',
	): SQLiteEffectRaw<TRow[], TEffectHKT>;

	all<TRow extends Record<string, any> = Record<string, unknown>>(
		query: SQLWrapper | string,
		mode?: 'objects' | undefined,
	): SQLiteEffectRaw<TRow[], TEffectHKT>;

	get<TRow extends unknown[] = unknown[]>(
		query: SQLWrapper | string,
		mode: 'arrays',
	): SQLiteEffectRaw<TRow | undefined, TEffectHKT>;

	get<TRow extends Record<string, any> = Record<string, unknown>>(
		query: SQLWrapper | string,
		mode?: 'objects' | undefined,
	): SQLiteEffectRaw<TRow | undefined, TEffectHKT>;

	values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT>;
}

export class SQLiteEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteDatabase<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: SQLiteEffectSession<TRunResult, TEffectHKT, TRelations>;
	};

	/** @internal */
	declare readonly session: SQLiteEffectSession<TRunResult, TEffectHKT, TRelations>;

	constructor(
		/** @internal */
		dialect: SQLiteDialect,
		/** @internal */
		session: SQLiteEffectSession<TRunResult, TEffectHKT, TRelations>,
		relations: TRelations,
		forbidJsonb?: boolean,
	) {
		super(sqliteEffectBuilders, undefined, dialect, session, relations, forbidJsonb);
	}

	transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}

export type SQLiteEffectWithReplicas<Q> = Q & {
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
	TRunResult,
	TRelations extends AnyRelations,
	Q extends SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SQLiteEffectWithReplicas<Q> => {
	return Object.create(primary, {
		$replica: { get: () => getReplica(replicas) },
		$primary: { value: primary },
		$replicas: { value: replicas },
	});
};
