import { entityKind } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { AnyMySqlQueryResultHKT, MySqlQueryResultHKT } from '~/mysql-core/session.ts';
import type { MySqlSession } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type CommentInput, type Placeholder, type Query, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import type { Assume, ValueOrArray } from '~/utils.ts';
import type { MySqlColumn } from '../columns/common.ts';

export type MySqlDeleteWithout<
	T extends AnyMySqlDelete,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		MySqlDeleteKind<
			T['_']['hkt'],
			T['_']['table'],
			T['_']['queryResult'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type MySqlDelete<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = AnyMySqlQueryResultHKT,
> = MySqlDeleteBase<MySqlDeleteHKT, TTable, TQueryResult, true, never>;

export interface MySqlDeleteConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	table: MySqlTable;
	withList?: Subquery[];
	comment?: SQL;
}

export type MySqlDeleteDynamic<T extends AnyMySqlDelete> = MySqlDeleteKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['queryResult'],
	true,
	never
>;

export type AnyMySqlDelete = MySqlDeleteBase<any, any, any, any, any>;

export interface MySqlDeleteHKTBase {
	table: unknown;
	queryResult: unknown;
	dynamic: boolean;
	excludedMethods: string;
	_type: unknown;
}

export interface MySqlDeleteHKT extends MySqlDeleteHKTBase {
	_type: MySqlDeleteBase<
		MySqlDeleteHKT,
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type MySqlDeleteKind<
	T extends MySqlDeleteHKTBase,
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	queryResult: TQueryResult;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
})['_type'];

export interface MySqlDeleteBase<
	THKT extends MySqlDeleteHKTBase,
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper {
	readonly _: {
		readonly hkt: THKT;
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class MySqlDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends MySqlDeleteHKTBase,
	TTable extends MySqlTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlDelete';

	protected config: MySqlDeleteConfig;

	constructor(
		private table: TTable,
		protected session: MySqlSession,
		protected dialect: MySqlDialect,
		withList?: Subquery[],
	) {
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

	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 */
	comment(comment: CommentInput): MySqlDeleteWithout<this, TDynamic, 'comment'> {
		this.config.comment = sql.comment(comment);
		return this as any;
	}

	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	$dynamic(): MySqlDeleteDynamic<this> {
		return this as any;
	}
}
