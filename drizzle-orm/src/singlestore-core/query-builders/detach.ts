import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
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
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';

export type SingleStoreDetachWithout<
	T extends AnySingleStoreDetachBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SingleStoreDetachBase<
			T['_']['database'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SingleStoreDetach<
	TDatabase extends string = string,
	TQueryResult extends SingleStoreQueryResultHKT = AnySingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = SingleStoreDetachBase<TDatabase, TQueryResult, TPreparedQueryHKT, true, never>;

export interface SingleStoreDetachConfig {
	milestone?: string | undefined;
	database: string;
	workspace?: string | undefined;
}

export type SingleStoreDetachPrepare<T extends AnySingleStoreDetachBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	SingleStorePreparedQueryConfig & {
		execute: SingleStoreQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type SingleStoreDetachDynamic<T extends AnySingleStoreDetachBase> = SingleStoreDetach<
	T['_']['database'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnySingleStoreDetachBase = SingleStoreDetachBase<any, any, any, any, any>;

export interface SingleStoreDetachBase<
	TDatabase extends string,
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly database: TDatabase;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class SingleStoreDetachBase<
	TDatabase extends string,
	TQueryResult extends SingleStoreQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'SingleStoreDetach';

	private config: SingleStoreDetachConfig;

	constructor(
		private database: TDatabase,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
	) {
		super();
		this.config = { database };
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
	 * // Detach all cars with green color
	 * db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Detach all BMW cars with a green color
	 * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Detach all cars with the green or blue color
	 * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	atMilestone(milestone: string | undefined): SingleStoreDetachWithout<this, TDynamic, 'atMilestone'> {
		this.config.milestone = milestone;
		return this as any;
	}

	// TODO: docs
	fromWorkspace(workspace: string | undefined): SingleStoreDetachWithout<this, TDynamic, 'fromWorkspace'> {
		this.config.workspace = workspace;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDetachQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): SingleStoreDetachPrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
		) as SingleStoreDetachPrepare<this>;
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

	$dynamic(): SingleStoreDetachDynamic<this> {
		return this as any;
	}
}
