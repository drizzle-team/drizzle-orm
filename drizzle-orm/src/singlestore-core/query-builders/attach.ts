import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
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

export type SingleStoreAttachWithout<
	T extends AnySingleStoreAttachBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SingleStoreAttachBase<
			T['_']['database'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SingleStoreAttach<
	TDatabase extends string = string,
	TQueryResult extends SingleStoreQueryResultHKT = AnySingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = SingleStoreAttachBase<TDatabase, TQueryResult, TPreparedQueryHKT, true, never>;

export interface SingleStoreAttachConfig {
	milestone?: string | undefined;
	time?: Date | undefined;
	database: string;
	databaseAlias?: string | undefined;
	readOnly?: boolean | undefined;
}

export type SingleStoreAttachPrepare<T extends AnySingleStoreAttachBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	SingleStorePreparedQueryConfig & {
		execute: SingleStoreQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type SingleStoreAttachDynamic<T extends AnySingleStoreAttachBase> = SingleStoreAttach<
	T['_']['database'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnySingleStoreAttachBase = SingleStoreAttachBase<any, any, any, any, any>;

export interface SingleStoreAttachBase<
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

export class SingleStoreAttachBase<
	TDatabase extends string,
	TQueryResult extends SingleStoreQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'SingleStoreAttach';

	private config: SingleStoreAttachConfig;

	constructor(
		private database: TDatabase,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
	) {
		super();
		this.config = { database };
	}

	as(dabataseAlias: string): SingleStoreAttachWithout<this, true, 'as'> {
		if (this.config.readOnly) {
			throw new DrizzleError({ message: 'Cannot set both databaseAlias and readOnly' });
		}
		this.config.databaseAlias = dabataseAlias;
		return this as any;
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
	 * // Attach all cars with green color
	 * db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Attach all BMW cars with a green color
	 * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Attach all cars with the green or blue color
	 * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	// TODO(singlestore): docs
	atMilestone(milestone: string): SingleStoreAttachWithout<this, TDynamic, 'atMilestone'> {
		if (this.config.time) {
			throw new DrizzleError({ message: 'Cannot set both time and milestone' });
		}
		this.config.milestone = milestone;
		return this as any;
	}

	// TODO(singlestore): docs
	atTime(time: Date): SingleStoreAttachWithout<this, TDynamic, 'atTime'> {
		if (this.config.milestone) {
			throw new DrizzleError({ message: 'Cannot set both time and milestone' });
		}
		this.config.time = time;
		return this as any;
	}

	// TODO(singlestore): docs
	readOnly(): SingleStoreAttachWithout<this, true, 'readOnly'> {
		if (this.config.databaseAlias) {
			throw new DrizzleError({ message: 'Cannot set both databaseAlias and readOnly' });
		}
		this.config.readOnly = true;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildAttachQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): SingleStoreAttachPrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
		) as SingleStoreAttachPrepare<this>;
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

	$dynamic(): SingleStoreAttachDynamic<this> {
		return this as any;
	}
}
