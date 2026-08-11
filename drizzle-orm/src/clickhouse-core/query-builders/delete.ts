import type { ClickHouseDialect } from '~/clickhouse-core/dialect.ts';
import type { ClickHouseSettings } from '~/clickhouse-core/engines.ts';
import type {
	AnyClickHouseQueryResultHKT,
	ClickHousePreparedQueryConfig,
	ClickHouseQueryResultHKT,
	ClickHouseQueryResultKind,
	ClickHouseSession,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/clickhouse-core/session.ts';
import type { ClickHouseTable } from '~/clickhouse-core/table.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { extractUsedTable } from '../utils.ts';

export type ClickHouseDeleteWithout<
	T extends AnyClickHouseDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		ClickHouseDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type ClickHouseDelete<
	TTable extends ClickHouseTable = ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT = AnyClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = ClickHouseDeleteBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export interface ClickHouseDeleteConfig {
	where?: SQL | undefined;
	table: ClickHouseTable;
	/**
	 * When set, the delete is issued as an `ALTER TABLE … DELETE` mutation instead of a lightweight
	 * `DELETE FROM`. See {@link ClickHouseDeleteBase.mutation}.
	 */
	mutation?: boolean;
	settings?: ClickHouseSettings;
}

export type ClickHouseDeletePrepare<T extends AnyClickHouseDeleteBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	ClickHousePreparedQueryConfig & {
		execute: ClickHouseQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type ClickHouseDeleteDynamic<T extends AnyClickHouseDeleteBase> = ClickHouseDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnyClickHouseDeleteBase = ClickHouseDeleteBase<any, any, any, any, any>;

export interface ClickHouseDeleteBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class ClickHouseDeleteBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'ClickHouseDelete';

	private config: ClickHouseDeleteConfig;

	constructor(
		private table: TTable,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
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
	where(where: SQL | undefined): ClickHouseDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/**
	 * Issues the delete as an `ALTER TABLE … DELETE` mutation rather than a lightweight `DELETE FROM`.
	 *
	 * Lightweight deletes (the default) mark rows deleted immediately and are cheap; mutations rewrite
	 * every affected part and run asynchronously in the background, but are supported on older servers
	 * and on table engines where lightweight deletes are not.
	 *
	 * Either way the delete is *not* transactional and not immediately reflected on disk.
	 */
	mutation(): ClickHouseDeleteWithout<this, TDynamic, 'mutation'> {
		this.config.mutation = true;
		return this as any;
	}

	/** Adds a query-level `SETTINGS` clause, e.g. `{ mutations_sync: 2 }` to wait for a mutation. */
	settings(settings: ClickHouseSettings): ClickHouseDeleteWithout<this, TDynamic, 'settings'> {
		this.config.settings = { ...this.config.settings, ...settings };
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

	prepare(): ClickHouseDeletePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
			undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as ClickHouseDeletePrepare<this>;
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

	$dynamic(): ClickHouseDeleteDynamic<this> {
		return this as any;
	}
}
