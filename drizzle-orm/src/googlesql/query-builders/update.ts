import type { GetColumnData } from '~/column.ts';
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
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { mapUpdateSet, type UpdateSet, type ValueOrArray } from '~/utils.ts';
import type { GoogleSqlColumn } from '../columns/common.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface GoogleSqlUpdateConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (GoogleSqlColumn | SQL | SQL.Aliased)[];
	set: UpdateSet;
	table: GoogleSqlTable;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type GoogleSqlUpdateSetSource<TTable extends GoogleSqlTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL
			| undefined;
	}
	& {};

export class GoogleSqlUpdateBuilder<
	TTable extends GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'GoogleSqlUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: GoogleSqlSession,
		private dialect: GoogleSqlDialect,
		private withList?: Subquery[],
	) {}

	set(values: GoogleSqlUpdateSetSource<TTable>): GoogleSqlUpdateBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new GoogleSqlUpdateBase(this.table, mapUpdateSet(this.table, values), this.session, this.dialect, this.withList);
	}
}

export type GoogleSqlUpdateWithout<
	T extends AnyGoogleSqlUpdateBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	GoogleSqlUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['preparedQueryHKT'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type GoogleSqlUpdatePrepare<T extends AnyGoogleSqlUpdateBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	GoogleSqlPreparedQueryConfig & {
		execute: GoogleSqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

export type GoogleSqlUpdateDynamic<T extends AnyGoogleSqlUpdateBase> = GoogleSqlUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type GoogleSqlUpdate<
	TTable extends GoogleSqlTable = GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT = AnyGoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = GoogleSqlUpdateBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyGoogleSqlUpdateBase = GoogleSqlUpdateBase<any, any, any, any, any>;

export interface GoogleSqlUpdateBase<
	TTable extends GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<GoogleSqlQueryResultKind<TQueryResult, never>>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class GoogleSqlUpdateBase<
	TTable extends GoogleSqlTable,
	TQueryResult extends GoogleSqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<GoogleSqlQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'GoogleSqlUpdate';

	private config: GoogleSqlUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: GoogleSqlSession,
		private dialect: GoogleSqlDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { set, table, withList };
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
	where(where: SQL | undefined): GoogleSqlUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (updateTable: TTable) => ValueOrArray<GoogleSqlColumn | SQL | SQL.Aliased>,
	): GoogleSqlUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (GoogleSqlColumn | SQL | SQL.Aliased)[]): GoogleSqlUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(updateTable: TTable) => ValueOrArray<GoogleSqlColumn | SQL | SQL.Aliased>]
			| (GoogleSqlColumn | SQL | SQL.Aliased)[]
	): GoogleSqlUpdateWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.table[Table.Symbol.Columns],
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as any,
			);

			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
			this.config.orderBy = orderByArray;
		} else {
			const orderByArray = columns as (GoogleSqlColumn | SQL | SQL.Aliased)[];
			this.config.orderBy = orderByArray;
		}
		return this as any;
	}

	limit(limit: number | Placeholder): GoogleSqlUpdateWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
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

	prepare(): GoogleSqlUpdatePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
		) as GoogleSqlUpdatePrepare<this>;
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

	$dynamic(): GoogleSqlUpdateDynamic<this> {
		return this as any;
	}
}
