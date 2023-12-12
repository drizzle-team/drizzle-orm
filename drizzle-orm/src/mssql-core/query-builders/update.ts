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
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { mapUpdateSet, type UpdateSet } from '~/utils.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface MsSqlUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: MsSqlTable;
	returning?: SelectedFieldsOrdered;
}

export type MsSqlUpdateSetSource<TTable extends MsSqlTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
	& {};

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
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type MsSqlUpdatePrepare<T extends AnyMsSqlUpdateBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: QueryResultKind<T['_']['queryResult'], any>;
		iterator: never;
	}
>;

export type MsSqlUpdateDynamic<T extends AnyMsSqlUpdateBase> = MsSqlUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type MsSqlUpdate<
	TTable extends MsSqlTable = MsSqlTable,
	TQueryResult extends QueryResultHKT = AnyQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = MsSqlUpdateBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyMsSqlUpdateBase = MsSqlUpdateBase<any, any, any, any, any>;

export interface MsSqlUpdateBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, any>>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
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
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, any>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MsSqlUpdate';

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

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): MsSqlUpdatePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
		) as MsSqlUpdatePrepare<this>;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};

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
