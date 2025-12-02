import type { GetColumnData } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type {
	AnyQueryResultHKT,
	MsSqlSession,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	QueryResultHKT,
	QueryResultKind,
} from '~/mssql-core/session.ts';
import type { MsSqlTable } from '~/mssql-core/table.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { ExtractObjectValues } from '~/relations.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { type InferInsertModel, Table } from '~/table.ts';
import { mapUpdateSet, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { MsSqlColumn } from '../columns/common.ts';
import type { SelectedFieldsFlatUpdate, SelectedFieldsOrdered } from './select.types.ts';

export interface MsSqlUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: MsSqlTable;
	output?: {
		inserted?: SelectedFieldsOrdered;
		deleted?: SelectedFieldsOrdered;
	};
}

export type MsSqlUpdateSetSource<TTable extends MsSqlTable> =
	& {
		[Key in keyof InferInsertModel<TTable>]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
	& {};

export type NonUndefinedKeysOnly<T> =
	& ExtractObjectValues<
		{
			[K in keyof T as T[K] extends undefined ? never : K]: K;
		}
	>
	& keyof T;

export type FormSelection<T, TTable extends MsSqlTable> = {
	[K in keyof T as T[K] extends undefined ? never : K]: T[K] extends true ? TTable['_']['columns'] : T[K];
};

export type MsSqlUpdateReturning<
	T extends AnyMsSqlUpdateBase,
	TDynamic extends boolean,
	SelectedFields extends SelectedFieldsFlatUpdate,
> = MsSqlUpdateWithout<
	MsSqlUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['preparedQueryHKT'],
		SelectResultFields<FormSelection<SelectedFields, T['_']['table']>>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'output'
>;

export type MsSqlUpdateReturningAll<T extends AnyMsSqlUpdateBase, TDynamic extends boolean> = MsSqlUpdateWithout<
	MsSqlUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['preparedQueryHKT'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'output'
>;

export class MsSqlUpdateBuilder<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'MsSqlUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: MsSqlSession,
		private dialect: MsSqlDialect,
	) {}

	set(values: MsSqlUpdateSetSource<TTable>): MsSqlUpdateBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MsSqlUpdateBase(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export type MsSqlUpdateWithout<
	T extends AnyMsSqlUpdateBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	MsSqlUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['preparedQueryHKT'],
		T['_']['output'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type MsSqlUpdatePrepare<T extends AnyMsSqlUpdateBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: T['_']['output'] extends undefined ? QueryResultKind<T['_']['queryResult'], any> : T['_']['output'][];
		iterator: never;
	}
>;

export type MsSqlUpdateDynamic<T extends AnyMsSqlUpdateBase> = MsSqlUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT'],
	T['_']['output']
>;

export type MsSqlUpdate<
	TTable extends MsSqlTable = MsSqlTable,
	TQueryResult extends QueryResultHKT = AnyQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TOutput extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = MsSqlUpdateBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput, true, never>;

export type AnyMsSqlUpdateBase = MsSqlUpdateBase<any, any, any, any, any, any>;

export interface MsSqlUpdateBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TOutput extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<TOutput extends undefined ? QueryResultKind<TQueryResult, any> : TOutput[]>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly output: TOutput;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class MsSqlUpdateBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TOutput extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TOutput extends undefined ? QueryResultKind<TQueryResult, any> : TOutput[]>
	implements SQLWrapper
{
	static override readonly [entityKind]: string = 'MsSqlUpdate';

	private config: MsSqlUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: MsSqlSession,
		private dialect: MsSqlDialect,
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
	 * db.update(cars).set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'));
	 * // or
	 * db.update(cars).set({ color: 'red' })
	 *   .where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Update all BMW cars with a green color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Update all cars with the green or blue color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): MsSqlUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/**
	 * Adds an `output` clause to the query.
	 *
	 * This method allows you to return values from the rows affected by the query.
	 * MSSQL supports returning `inserted` (new row values) and `deleted` (old row values) values.
	 *
	 * If no fields are specified, all `inserted` values will be returned by default.
	 *
	 * @example
	 * ```ts
	 * // Update cars and return all new values
	 * const updatedCars: Car[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .output()
	 *   .where(eq(cars.color, 'green'));
	 *
	 * // Update cars and return all old values
	 * const updatedCarsIds: { deleted: Car }[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .output({ deleted: true })
	 *   .where(eq(cars.color, 'green'));
	 *
	 * // Update cars and return partial old and new values
	 * const beforeAndAfter: { deleted: { oldColor: string }, inserted: { newColor: string } }[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .output({
	 *     deleted: { oldColor: cars.color },
	 *     inserted: { newColor: cars.color }
	 *   })
	 *   .where(eq(cars.color, 'green'));
	 * ```
	 */
	output(): MsSqlUpdateReturningAll<this, TDynamic>;
	output<TSelectedFields extends SelectedFieldsFlatUpdate>(
		fields: TSelectedFields,
	): MsSqlUpdateReturning<this, TDynamic, TSelectedFields>;
	output(
		fields?: SelectedFieldsFlatUpdate,
	): MsSqlUpdateWithout<AnyMsSqlUpdateBase, TDynamic, 'output'> {
		const columns = this.config.table[Table.Symbol.Columns];

		if (fields) {
			const output: typeof this.config.output = {};

			if (fields.inserted) {
				output.inserted = typeof fields.inserted === 'boolean'
					? orderSelectedFields<MsSqlColumn>(columns, ['inserted'])
					: orderSelectedFields<MsSqlColumn>(fields.inserted, ['inserted']);
			}

			if (fields.deleted) {
				output.deleted = typeof fields.deleted === 'boolean'
					? orderSelectedFields<MsSqlColumn>(columns, ['deleted'])
					: orderSelectedFields<MsSqlColumn>(fields.deleted, ['deleted']);
			}

			this.config.output = output;
		} else {
			this.config.output = {
				inserted: orderSelectedFields<MsSqlColumn>(columns),
			};
		}

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

	prepare(): MsSqlUpdatePrepare<this> {
		const output = [...(this.config.output?.inserted ?? []), ...(this.config.output?.deleted ?? [])];

		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			output.length ? output : undefined,
		) as MsSqlUpdatePrepare<this>;
	}

	override execute(
		placeholderValues?: Record<string, unknown>,
	): Promise<TOutput extends undefined ? QueryResultKind<TQueryResult, any> : TOutput[]> {
		return this.prepare().execute(placeholderValues) as any;
	}

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();

	$dynamic(): MsSqlUpdateDynamic<this> {
		return this as any;
	}
}
