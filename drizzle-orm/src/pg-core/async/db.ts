import { entityKind } from '~/entity.ts';
import type { BasePgAsyncSession, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgInsertBuilder, PgUpdateBuilder } from '~/pg-core/query-builders/index.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PgTransactionConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { WithSubquery } from '~/subquery.ts';
import type { InferInsertModel, RequiredInsertKeys } from '~/table.ts';
import type { PgColumn } from '../columns/index.ts';
import { PgDatabase, type PgDatabaseBuilders, type PgInsertColumns } from '../db.ts';
import type { PgProcedure, PgProcedureCallParams } from '../procedure.ts';
import type { RelationalQueryBuilder } from '../query-builders/query.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgMaterializedView } from '../view.ts';
import { PgAsyncCountBuilder } from './count.ts';
import { PgAsyncDeleteBase } from './delete.ts';
import { PgAsyncInsertBase, type PgAsyncInsertHKT } from './insert.ts';
import { PgAsyncRelationalQuery, type PgAsyncRelationalQueryHKT } from './query.ts';
import { PgAsyncRaw } from './raw.ts';
import { PgAsyncRefreshMaterializedView } from './refresh-materialized-view.ts';
import { PgAsyncSelectBase, type PgAsyncSelectBuilder } from './select.ts';
import { PgAsyncUpdateBase, type PgAsyncUpdateHKT } from './update.ts';

const pgAsyncBuilders: PgDatabaseBuilders = {
	select: PgAsyncSelectBase,
	insert: PgAsyncInsertBase,
	update: PgAsyncUpdateBase,
	delete: PgAsyncDeleteBase,
	count: PgAsyncCountBuilder,
	raw: PgAsyncRaw,
	refreshMaterializedView: PgAsyncRefreshMaterializedView,
	relationalQuery: PgAsyncRelationalQuery,
};

/** The query builders of {@link BasePgAsyncDatabase.with}: they run with it's CTEs */
export type PgAsyncWithBuilders<TQueryResult extends PgQueryResultHKT> = Pick<
	BasePgAsyncDatabase<TQueryResult, any>,
	'select' | 'selectDistinct' | 'selectDistinctOn' | 'update' | 'insert' | 'delete'
>;

export interface BasePgAsyncDatabase<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> {
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
	select(): PgAsyncSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgAsyncSelectBuilder<TSelection>;

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
	selectDistinct(): PgAsyncSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgAsyncSelectBuilder<TSelection>;

	/**
	 * Adds `distinct on` expression to the select query.
	 *
	 * Calling this method will specify how the unique rows are determined.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
	 *
	 * @param on The expression defining uniqueness.
	 * @param fields The selection object.
	 *
	 * @example
	 * ```ts
	 * // Select the first row for each unique brand from the 'cars' table
	 * await db.selectDistinctOn([cars.brand])
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 *
	 * // Selects the first occurrence of each unique car brand along with it's color from the 'cars' table
	 * await db.selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
	 *   .from(cars)
	 *   .orderBy(cars.brand, cars.color);
	 * ```
	 */
	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgAsyncSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgAsyncSelectBuilder<TSelection>;

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
	update<TTable extends PgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult, PgAsyncUpdateHKT>;

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
		TTable extends PgTable,
		TColumnList extends (keyof InferInsertModel<TTable, { override: true }>)[] = [],
		TRequiredKeys extends string = RequiredInsertKeys<TTable>,
	>(
		table: TTable,
		...columns: PgInsertColumns<TColumnList, TRequiredKeys>
	): PgInsertBuilder<TTable, TQueryResult, TColumnList extends [] ? 'all' : TColumnList, false, PgAsyncInsertHKT>;

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
	delete<TTable extends PgTable>(table: TTable): PgAsyncDeleteBase<TTable, TQueryResult>;

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TRelations,
			TRelations[K],
			PgAsyncRelationalQueryHKT
		>;
	};

	$count(source: PgTable | PgViewBase | SQL | SQLWrapper, filters?: SQL<unknown>): PgAsyncCountBuilder;

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
	with(...queries: WithSubquery[]): PgAsyncWithBuilders<TQueryResult>;

	refreshMaterializedView<TView extends PgMaterializedView>(view: TView): PgAsyncRefreshMaterializedView<TQueryResult>;

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
	 * const rows = await db.execute<[number, string]>(sql`select ${users.id}, ${users.name} from ${users}`, 'arrays');
	 * ```
	 */
	execute<TRow extends unknown[] = unknown[]>(
		query: SQLWrapper | string,
		mode: 'arrays',
	): PgAsyncRaw<TRow[]>;
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
	 * const rows = await db.execute<{ id: number; name: string }>(sql`select ${users.id}, ${users.name} from ${users}`, 'objects');
	 * ```
	 */
	execute<TRow extends Record<string, any> = Record<string, unknown>>(
		query: SQLWrapper | string,
		mode: 'objects',
	): PgAsyncRaw<TRow[]>;
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
	 * const response = await db.execute(sql`select * from ${users}`);
	 *
	 * // Response of a statement that returns no rows
	 * const updated = await db.execute<never>(sql`update ${users} set ${users.name} = ${'John'}`);
	 *
	 * // Response with rows of given shape
	 * const selected = await db.execute<{ id: number; name: string }>(sql`select ${users.id}, ${users.name} from ${users}`);
	 * ```
	 */
	execute<TRow extends Record<string, any> | 'unknown' = 'unknown'>(
		query: SQLWrapper | string,
		mode?: 'raw' | undefined,
	): PgAsyncRaw<PgQueryResultKind<TQueryResult, TRow>>;

	/**
	 * Calls a procedure declared with {@link procedure}: `CALL "name"(p_a => $1, ...)`.
	 *
	 * Resolves to the record the procedure body returns (one row of it's INOUT parameters), or
	 * `undefined` for procedures that return nothing. Values are returned as the driver produces
	 * them: no codecs run on `CALL` results, so `numeric`/`bigint` fields typically arrive as strings.
	 *
	 * A procedure that uses `ctx.commit()`/`ctx.rollback()` must not be called inside `db.transaction()`.
	 *
	 * @example
	 * ```ts
	 * const { newBalance } = await db.call(transfer, { from: 1, to: 2, amount: 30 });
	 * ```
	 */
	call<TProcedure extends PgProcedure<any, any>>(
		procedure: TProcedure,
		...args: PgProcedureCallParams<TProcedure>
	): PgAsyncRaw<TProcedure['_']['result']>;
}

/** Transactionless definition -  branches out into `PostgreSQL` & `DSQL` variants */
export class BasePgAsyncDatabase<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'BasePgAsyncDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: BasePgAsyncSession;
	};

	/** @internal */
	declare readonly session: BasePgAsyncSession;

	constructor(
		/** @internal */
		dialect: PgDialect,
		/** @internal */
		session: BasePgAsyncSession,
		relations: TRelations,
		parseRqbJson: boolean = false,
		tagged: boolean = false,
	) {
		super(pgAsyncBuilders, dialect, session, relations, parseRqbJson, tagged);
	}
}

export class PgAsyncDatabase<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends BasePgAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'PgAsyncDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: PgAsyncSession<TQueryResult, TRelations>;
	};

	/** @internal */
	declare readonly session: PgAsyncSession<TQueryResult, TRelations>;

	constructor(
		/** @internal */
		dialect: PgDialect,
		/** @internal */
		session: PgAsyncSession<TQueryResult, TRelations>,
		relations: TRelations,
		parseRqbJson: boolean = false,
		tagged: boolean = false,
	) {
		super(dialect, session, relations, parseRqbJson, tagged);
	}

	transaction<T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}

export type PgAsyncWithReplicas<Q> = Q & {
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
	HKT extends PgQueryResultHKT,
	TRelations extends AnyRelations,
	Q extends PgAsyncDatabase<HKT, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): PgAsyncWithReplicas<Q> => {
	return Object.create(primary, {
		$replica: { get: () => getReplica(replicas) },
		$primary: { value: primary },
		$replicas: { value: replicas },
	});
};
