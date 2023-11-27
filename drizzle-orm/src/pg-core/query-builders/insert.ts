import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { IndexColumn } from '~/pg-core/indexes.ts';
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
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { mapUpdateSet, orderSelectedFields } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { PgUpdateSetSource } from './update.ts';
import type { PgColumn } from '../columns/common.ts';

export interface PgInsertConfig<TTable extends PgTable = PgTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export type PgInsertValue<TTable extends PgTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

export class PgInsertBuilder<TTable extends PgTable, TQueryResult extends QueryResultHKT> {
	static readonly [entityKind]: string = 'PgInsertBuilder';

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	values(value: PgInsertValue<TTable>): PgInsertBase<TTable, TQueryResult>;
	values(values: PgInsertValue<TTable>[]): PgInsertBase<TTable, TQueryResult>;
	values(values: PgInsertValue<TTable> | PgInsertValue<TTable>[]): PgInsertBase<TTable, TQueryResult> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});

		return new PgInsertBase(this.table, mappedValues, this.session, this.dialect);
	}
}

export type PgInsertWithout<T extends AnyPgInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			PgInsertBase<
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['returning'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type PgInsertReturning<
	T extends AnyPgInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = PgInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	SelectResultFields<TSelectedFields>,
	TDynamic,
	T['_']['excludedMethods']
>;

export type PgInsertReturningAll<T extends AnyPgInsert, TDynamic extends boolean> = PgInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['table']['$inferSelect'],
	TDynamic,
	T['_']['excludedMethods']
>;

export interface PgInsertOnConflictDoUpdateConfig<T extends AnyPgInsert> {
	target: IndexColumn | IndexColumn[];
	where?: SQL;
	set: PgUpdateSetSource<T['_']['table']>;
}

export type PgInsertPrepare<T extends AnyPgInsert> = PreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? QueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgInsertDynamic<T extends AnyPgInsert> = PgInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type AnyPgInsert = PgInsertBase<any, any, any, any, any>;

export interface PgInsertBase<
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

export type PgInsert<
	TTable extends PgTable = PgTable,
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgInsertBase<TTable, TQueryResult, TReturning, true, never>;

export class PgInsertBase<
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
	static readonly [entityKind]: string = 'PgInsert';

	private config: PgInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: PgInsertConfig['values'],
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { table, values };
	}

	/**
	 * Adds a `returning` clause to the query.
	 * 
	 * Calling this method will return the specified fields of the inserted rows. If no fields are specified, all fields will be returned.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/insert#insert-returning}
	 * 
	 * @example
	 * ```ts
	 * // Insert one row and return all fields
	 * const insertedCar: Car[] = await db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning();
	 * 
	 * // Insert one row and return only the id
	 * const insertedCarId: { id: number }[] = await db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning({ id: cars.id });
	 * ```
	 */
	returning(): PgInsertWithout<PgInsertReturningAll<this, TDynamic>, TDynamic, 'returning'>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgInsertWithout<PgInsertReturning<this, TDynamic, TSelectedFields>, TDynamic, 'returning'>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): PgInsertWithout<AnyPgInsert, TDynamic, 'returning'> {
		this.config.returning = orderSelectedFields<PgColumn>(fields);
		return this as any;
	}

	/**
	 * Adds an `on conflict do nothing` clause to the query.
	 * 
	 * Calling this method simply avoids inserting a row as its alternative action.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
	 * 
	 * @param config The `target` and `where` clauses.
	 * 
	 * @example
	 * ```ts
	 * // Insert one row and cancel the insert if there's a conflict
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoNothing();
	 * 
	 * // Explicitly specify conflict target
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoNothing({ target: cars.id });
	 * ```
	 */
	onConflictDoNothing(
		config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {},
	): PgInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			let targetColumn = '';
			targetColumn = Array.isArray(config.target)
				? config.target.map((it) => this.dialect.escapeName(it.name)).join(',')
				: this.dialect.escapeName(config.target.name);

			const whereSql = config.where ? sql` where ${config.where}` : undefined;
			this.config.onConflict = sql`(${sql.raw(targetColumn)}) do nothing${whereSql}`;
		}
		return this as any;
	}


	/**
	 * Adds an `on conflict do update` clause to the query.
	 * 
	 * Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts} 
	 * 
	 * @param config The `target`, `set` and `where` clauses.
	 * 
	 * @example
	 * ```ts
	 * // Update the row if there's a conflict
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoUpdate({ 
	 *     target: cars.id, 
	 *     set: { brand: 'Porsche' } 
	 *   });
	 * 
	 * // Upsert with 'where' clause
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoUpdate({
	 *     target: cars.id,
	 *     set: { brand: 'newBMW' },
	 *     where: sql`${cars.createdAt} > '2023-01-01'::date`,
	 *   });
	 * ```
	 */
	onConflictDoUpdate(
		config: PgInsertOnConflictDoUpdateConfig<this>,
	): PgInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
		const whereSql = config.where ? sql` where ${config.where}` : undefined;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		let targetColumn = '';
		targetColumn = Array.isArray(config.target)
			? config.target.map((it) => this.dialect.escapeName(it.name)).join(',')
			: this.dialect.escapeName(config.target.name);
		this.config.onConflict = sql`(${sql.raw(targetColumn)}) do update set ${setSql}${whereSql}`;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string): PgInsertPrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name);
		});
	}

	prepare(name: string): PgInsertPrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};

	$dynamic(): PgInsertDynamic<this> {
		return this as any;
	}
}
