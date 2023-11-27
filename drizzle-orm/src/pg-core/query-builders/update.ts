import type { GetColumnData } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type {
	PgSession,
	PreparedQuery,
	PreparedQueryConfig,
	QueryResultHKT,
	QueryResultKind,
} from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { mapUpdateSet, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { SelectedFields, SelectedFieldsOrdered } from './select.types.ts';
import type { PgColumn } from '../columns/common.ts';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: PgTable;
	returning?: SelectedFieldsOrdered;
}

export type PgUpdateSetSource<TTable extends PgTable> =
	& {
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL;
	}
	& {};

export class PgUpdateBuilder<TTable extends PgTable, TQueryResult extends QueryResultHKT> {
	static readonly [entityKind]: string = 'PgUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	set(values: PgUpdateSetSource<TTable>): PgUpdateBase<TTable, TQueryResult> {
		return new PgUpdateBase<TTable, TQueryResult>(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
		);
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
		T['_']['returning'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type PgUpdateReturningAll<T extends AnyPgUpdate, TDynamic extends boolean> = PgUpdateWithout<
	PgUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['table']['$inferSelect'],
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
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type PgUpdatePrepare<T extends AnyPgUpdate> = PreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? QueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgUpdateDynamic<T extends AnyPgUpdate> = PgUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type PgUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgUpdateBase<TTable, TQueryResult, TReturning, true, never>;

type AnyPgUpdate = PgUpdateBase<any, any, any, any, any>;

export interface PgUpdateBase<
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class PgUpdateBase<
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>
	implements SQLWrapper
{
	static readonly [entityKind]: string = 'PgUpdate';

	private config: PgUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { set, table };
	}

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
		fields: SelectedFields = this.config.table[Table.Symbol.Columns],
	): PgUpdateWithout<AnyPgUpdate, TDynamic, 'returning'> {
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

	private _prepare(name?: string): PgUpdatePrepare<this> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name);
	}

	prepare(name: string): PgUpdatePrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};

	$dynamic(): PgUpdateDynamic<this> {
		return this as any;
	}
}
