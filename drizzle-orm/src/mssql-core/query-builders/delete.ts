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
import type { SelectedFieldsOrdered } from './select.types.ts';

export type MsSqlDeleteWithout<
	T extends AnyMsSqlDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		MsSqlDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type MsSqlDelete<
	TTable extends MsSqlTable = MsSqlTable,
	TQueryResult extends QueryResultHKT = AnyQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = MsSqlDeleteBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export interface MsSqlDeleteConfig {
	where?: SQL | undefined;
	table: MsSqlTable;
	returning?: SelectedFieldsOrdered;
}

export type MsSqlDeletePrepare<T extends AnyMsSqlDeleteBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: QueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type MsSqlDeleteDynamic<T extends AnyMsSqlDeleteBase> = MsSqlDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnyMsSqlDeleteBase = MsSqlDeleteBase<any, any, any, any, any>;

export interface MsSqlDeleteBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class MsSqlDeleteBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MsSqlDelete';

	private config: MsSqlDeleteConfig;

	constructor(
		private table: TTable,
		private session: MsSqlSession,
		private dialect: MsSqlDialect,
	) {
		super();
		this.config = { table };
	}

	/** 
	 * Adds a `where` clause to the query.
	 * 
	 * Calling this method will delete only those rows that fulfill a specified condition.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 * 
	 * @param where the `where` clause.
	 * 
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be deleted.
	 * 
	 * ```ts
	 * // Delete all cars with green color
	 * db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 * 
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 * 
	 * ```ts
	 * // Delete all BMW cars with a green color
	 * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 * 
	 * // Delete all cars with the green or blue color
	 * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	*/
	where(where: SQL | undefined): MsSqlDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): MsSqlDeletePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
		) as MsSqlDeletePrepare<this>;
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

	$dynamic(): MsSqlDeleteDynamic<this> {
		return this as any;
	}
}
