import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import { SQLiteAsyncDeleteBase } from '~/sqlite-core/async/delete.ts';
import { SQLiteAsyncInsertBase, type SQLiteAsyncInsertBuilder } from '~/sqlite-core/async/insert.ts';
import { type DBResult, SQLiteAsyncRaw } from '~/sqlite-core/async/raw.ts';
import { SQLiteAsyncSelectBase, type SQLiteAsyncSelectBuilder } from '~/sqlite-core/async/select.ts';
import type { Result, SQLiteAsyncSession, SQLiteAsyncTransaction } from '~/sqlite-core/async/session.ts';
import { SQLiteAsyncUpdateBase, type SQLiteAsyncUpdateBuilder } from '~/sqlite-core/async/update.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { NoDuplicateColumns } from '~/sqlite-core/query-builders/index.ts';
import type { SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { WithSubquery } from '~/subquery.ts';
import type { InferInsertModel, RequiredInsertKeys } from '~/table.ts';
import type { DrizzleTypeError, IsNever, JoinUnion } from '~/utils.ts';
import type { RelationalQueryBuilder } from '../query-builders/query.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { SQLiteViewBase } from '../view-base.ts';
import { SQLiteAsyncCountBuilder, type SQLiteAsyncCountBuilderKind, SQLiteSyncCountBuilder } from './count.ts';
import { SQLiteAsyncRelationalQuery, type SQLiteAsyncRelationalQueryHKT, SQLiteSyncRelationalQuery } from './query.ts';

import type { Query } from '~/sql/sql.ts';
import { SQLiteDatabase, type SQLiteDatabaseBuilders } from '../db.ts';
import type { SQLiteExecuteMethod, SQLitePreparedQuery } from '../session.ts';

const sqliteAsyncBuilders: SQLiteDatabaseBuilders = {
	select: SQLiteAsyncSelectBase,
	insert: SQLiteAsyncInsertBase,
	update: SQLiteAsyncUpdateBase,
	delete: SQLiteAsyncDeleteBase,
	count: SQLiteAsyncCountBuilder,
	raw: SQLiteAsyncRaw,
	relationalQuery: SQLiteAsyncRelationalQuery,
};

/** Sync drivers' builders: their counts and relational queries also run with `.sync()` */
const sqliteSyncBuilders: SQLiteDatabaseBuilders = {
	...sqliteAsyncBuilders,
	count: SQLiteSyncCountBuilder,
	relationalQuery: SQLiteSyncRelationalQuery,
};

/** The query builders of {@link SQLiteAsyncDatabase.with}: they run with it's CTEs */
export type SQLiteAsyncWithBuilders<TResultKind extends 'sync' | 'async', TRunResult> = Pick<
	SQLiteAsyncDatabase<TResultKind, TRunResult, any>,
	'select' | 'selectDistinct' | 'update' | 'insert' | 'delete'
>;

export interface SQLiteAsyncDatabase<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TResultKind,
			TRelations,
			TRelations[K],
			SQLiteAsyncRelationalQueryHKT
		>;
	};

	$count(
		source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQLiteAsyncCountBuilderKind<TResultKind>;

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
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 */
	with(...queries: WithSubquery[]): SQLiteAsyncWithBuilders<TResultKind, TRunResult>;

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
	 * const allCars: Car[] = await db.select().from(cars);
	 *
	 * // Select specific columns and all rows from the 'cars' table
	 * const carsIdsAndBrands: { id: number; brand: string }[] = await db.select({
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
	 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = await db.select({
	 *   id: cars.id,
	 *   lowerBrand: sql<string>`lower(${cars.brand})`,
	 * })
	 *   .from(cars);
	 * ```
	 */
	select(): SQLiteAsyncSelectBuilder<undefined, TResultKind, TRunResult>;

	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteAsyncSelectBuilder<TSelection, TResultKind, TRunResult>;

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
	 * await db.selectDistinct()
	 *   .from(cars)
	 *   .orderBy(cars.id, cars.brand, cars.color);
	 *
	 * // Select all unique brands from the 'cars' table
	 * await db.selectDistinct({ brand: cars.brand })
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 * ```
	 */
	selectDistinct(): SQLiteAsyncSelectBuilder<undefined, TResultKind, TRunResult>;

	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteAsyncSelectBuilder<TSelection, TResultKind, TRunResult>;

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
	 * await db.update(cars).set({ color: 'red' });
	 *
	 * // Update rows with filters and conditions
	 * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
	 *
	 * // Update with returning clause
	 * const updatedCar: Car[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	update<TTable extends SQLiteTable>(table: TTable): SQLiteAsyncUpdateBuilder<TTable, TResultKind, TRunResult>;

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
	 * await db.insert(cars).values({ brand: 'BMW' });
	 *
	 * // Insert multiple rows
	 * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	 *
	 * // Insert only selected columns
	 * await db.insert(cars, 'brand', 'productionYear').values([{ brand: 'BMW', productionYear: 1995 }, { brand: 'Porsche', productionYear: 1989 }]);
	 *
	 * // Insert with returning clause
	 * const insertedCar: Car[] = await db.insert(cars)
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
	): SQLiteAsyncInsertBuilder<TTable, TResultKind, TRunResult, TColumnList extends [] ? 'all' : TColumnList>;

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
	 * await db.delete(cars);
	 *
	 * // Delete rows with filters and conditions
	 * await db.delete(cars).where(eq(cars.color, 'green'));
	 *
	 * // Delete with returning clause
	 * const deletedCar: Car[] = await db.delete(cars)
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	delete<TTable extends SQLiteTable>(from: TTable): SQLiteAsyncDeleteBase<TTable, TResultKind, TRunResult>;

	run(query: SQLWrapper | string): DBResult<TResultKind, TRunResult>;

	all<TRow extends unknown[] = unknown[]>(
		query: SQLWrapper | string,
		mode: 'arrays',
	): DBResult<TResultKind, TRow[]>;

	all<TRow extends Record<string, any> = Record<string, unknown>>(
		query: SQLWrapper | string,
		mode?: 'objects' | undefined,
	): DBResult<TResultKind, TRow[]>;

	get<TRow extends unknown[] = unknown[]>(
		query: SQLWrapper | string,
		mode: 'arrays',
	): DBResult<TResultKind, TRow | undefined>;

	get<TRow extends Record<string, any> = Record<string, unknown>>(
		query: SQLWrapper | string,
		mode?: 'objects' | undefined,
	): DBResult<TResultKind, TRow | undefined>;

	values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): DBResult<TResultKind, T[]>;
}

export class SQLiteAsyncDatabase<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteDatabase<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'BaseSQLiteDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: SQLiteAsyncSession<TResultKind, TRunResult, TRelations>;
		readonly resultKind: TResultKind;
	};

	/** @internal */
	declare readonly session: SQLiteAsyncSession<TResultKind, TRunResult, TRelations>;

	constructor(
		private resultKind: TResultKind,
		/** @internal */
		dialect: SQLiteDialect,
		/** @internal */
		session: SQLiteAsyncSession<TResultKind, TRunResult, TRelations>,
		relations: TRelations,
		forbidJsonb?: boolean,
	) {
		super(
			resultKind === 'sync' ? sqliteSyncBuilders : sqliteAsyncBuilders,
			resultKind,
			dialect,
			session,
			relations,
			forbidJsonb,
		);
		(this._ as { resultKind: TResultKind }).resultKind = resultKind;
	}

	/** @internal Sync drivers run raw queries right away */
	protected override wrapRaw(
		prepared: SQLitePreparedQuery,
		sequel: SQL,
		builtQuery: Query,
		method: SQLiteExecuteMethod,
	) {
		return this.resultKind === 'async' ? super.wrapRaw(prepared, sequel, builtQuery, method) : prepared[method]();
	}

	transaction<T>(
		transaction: (
			tx: SQLiteAsyncTransaction<TResultKind, TRunResult, TRelations>,
		) => TResultKind extends 'sync'
			? T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!"> : T
			: Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T> {
		return this.session.transaction(
			transaction as (
				tx: SQLiteAsyncTransaction<TResultKind, TRunResult, TRelations>,
			) => Result<TResultKind, T>,
			config,
		);
	}
}

export type SQLiteWithReplicas<Q> = Q & {
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
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations,
	Q extends SQLiteAsyncDatabase<
		TResultKind,
		TRunResult,
		TRelations
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SQLiteWithReplicas<Q> => {
	return Object.create(primary, {
		$replica: { get: () => getReplica(replicas) },
		$primary: { value: primary },
		$replicas: { value: replicas },
	});
};
