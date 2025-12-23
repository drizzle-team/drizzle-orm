import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type {
	AnySingleStoreQueryResultHKT,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStoreQueryResultHKT,
	SingleStoreQueryResultKind,
	SingleStoreSession,
} from '~/singlestore-core/session.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import type { ValueOrArray } from '~/utils.ts';
import type { SingleStoreColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export type SingleStoreDeleteWithout<
	T extends AnySingleStoreDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SingleStoreDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SingleStoreDelete<
	TTable extends SingleStoreTable = SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT = AnySingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = SingleStoreDeleteBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export interface SingleStoreDeleteConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (SingleStoreColumn | SQL | SQL.Aliased)[];
	table: SingleStoreTable;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type SingleStoreDeletePrepare<T extends AnySingleStoreDeleteBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	SingleStorePreparedQueryConfig & {
		execute: SingleStoreQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type SingleStoreDeleteDynamic<T extends AnySingleStoreDeleteBase> = SingleStoreDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnySingleStoreDeleteBase = SingleStoreDeleteBase<any, any, any, any, any>;

export interface SingleStoreDeleteBase<
	TTable extends SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class SingleStoreDeleteBase<
	TTable extends SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'SingleStoreDelete';

	private config: SingleStoreDeleteConfig;

	constructor(
		private table: TTable,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
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
	where(where: SQL | undefined): SingleStoreDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (deleteTable: TTable) => ValueOrArray<SingleStoreColumn | SQL | SQL.Aliased>,
	): SingleStoreDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SingleStoreColumn | SQL | SQL.Aliased)[]): SingleStoreDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(deleteTable: TTable) => ValueOrArray<SingleStoreColumn | SQL | SQL.Aliased>]
			| (SingleStoreColumn | SQL | SQL.Aliased)[]
	): SingleStoreDeleteWithout<this, TDynamic, 'orderBy'> {
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
			const orderByArray = columns as (SingleStoreColumn | SQL | SQL.Aliased)[];
			this.config.orderBy = orderByArray;
		}
		return this as any;
	}

	limit(limit: number | Placeholder): SingleStoreDeleteWithout<this, TDynamic, 'limit'> {
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

	prepare(): SingleStoreDeletePrepare<this> {
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
		) as SingleStoreDeletePrepare<this>;
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

	$dynamic(): SingleStoreDeleteDynamic<this> {
		return this as any;
	}
}
