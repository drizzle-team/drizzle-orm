import { entityKind } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type {
	AnyMySqlQueryResultHKT,
	MySqlPreparedQueryConfig,
	MySqlQueryResultHKT,
	MySqlQueryResultKind,
	MySqlSession,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import type { ValueOrArray } from '~/utils.ts';
import type { MySqlColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export type MySqlDeleteWithout<
	T extends AnyMySqlDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		MySqlDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type MySqlDelete<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = AnyMySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = MySqlDeleteBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export interface MySqlDeleteConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	table: MySqlTable;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type MySqlDeletePrepare<T extends AnyMySqlDeleteBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	MySqlPreparedQueryConfig & {
		execute: MySqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type MySqlDeleteDynamic<T extends AnyMySqlDeleteBase> = MySqlDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnyMySqlDeleteBase = MySqlDeleteBase<any, any, any, any, any>;

export interface MySqlDeleteBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<MySqlQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class MySqlDeleteBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<MySqlQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'MySqlDelete';

	private config: MySqlDeleteConfig;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, withList };
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
	where(where: SQL | undefined): MySqlDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (deleteTable: TTable) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>,
	): MySqlDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (MySqlColumn | SQL | SQL.Aliased)[]): MySqlDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(deleteTable: TTable) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>]
			| (MySqlColumn | SQL | SQL.Aliased)[]
	): MySqlDeleteWithout<this, TDynamic, 'orderBy'> {
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
			const orderByArray = columns as (MySqlColumn | SQL | SQL.Aliased)[];
			this.config.orderBy = orderByArray;
		}
		return this as any;
	}

	limit(limit: number | Placeholder): MySqlDeleteWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
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

	prepare(): MySqlDeletePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			undefined,
			undefined,
			undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as MySqlDeletePrepare<this>;
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

	$dynamic(): MySqlDeleteDynamic<this> {
		return this as any;
	}
}
