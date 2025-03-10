import { entityKind } from '~/entity.ts';
import type { GoogleSqlDialect } from '~/googlesql/dialect.ts';
import type {
	AnyGoogleSqlQueryResultHKT,
	GoogleSqlPreparedQueryConfig,
	GoogleSqlQueryResultHKT,
	GoogleSqlQueryResultKind,
	GoogleSqlSession,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/googlesql/session.ts';
import type { GoogleSqlTable } from '~/googlesql/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
// import type { Subquery } from '~/subquery.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export type GoogleSqlDeleteWithout<
	T extends AnyGoogleSqlDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		GoogleSqlDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type GoogleSqlDelete<
	TTable extends GoogleSqlTable = GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT = AnyGoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = GoogleSqlDeleteBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export interface GoogleSqlDeleteConfig {
	where?: SQL | undefined;
	table: GoogleSqlTable;
	returning?: SelectedFieldsOrdered;
	// withList?: Subquery[];
}

export type GoogleSqlDeletePrepare<T extends AnyGoogleSqlDeleteBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	GoogleSqlPreparedQueryConfig & {
		execute: GoogleSqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type GoogleSqlDeleteDynamic<T extends AnyGoogleSqlDeleteBase> = GoogleSqlDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnyGoogleSqlDeleteBase = GoogleSqlDeleteBase<any, any, any, any, any>;

export interface GoogleSqlDeleteBase<
	TTable extends GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<GoogleSqlQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class GoogleSqlDeleteBase<
	TTable extends GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<GoogleSqlQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'GoogleSqlDelete';

	private config: GoogleSqlDeleteConfig;

	constructor(
		private table: TTable,
		private session: GoogleSqlSession,
		private dialect: GoogleSqlDialect,
		// withList?: Subquery[],
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
	where(where: SQL | undefined): GoogleSqlDeleteWithout<this, TDynamic, 'where'> {
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

	prepare(): GoogleSqlDeletePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
		) as GoogleSqlDeletePrepare<this>;
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

	$dynamic(): GoogleSqlDeleteDynamic<this> {
		return this as any;
	}
}
