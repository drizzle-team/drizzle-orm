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

export type SingleStoreDropMilestoneWithout<
	T extends AnySingleStoreDropMilestoneBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SingleStoreDropMilestoneBase<
			T['_']['milestone'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SingleStoreDropMilestone<
	TDatabase extends string = string,
	TQueryResult extends SingleStoreQueryResultHKT = AnySingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = SingleStoreDropMilestoneBase<TDatabase, TQueryResult, TPreparedQueryHKT, true, never>;

export interface SingleStoreDropMilestoneConfig {
	milestone: string;
	database?: string | undefined;
}

export type SingleStoreDropMilestonePrepare<T extends AnySingleStoreDropMilestoneBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	SingleStorePreparedQueryConfig & {
		execute: SingleStoreQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type SingleStoreDropMilestoneDynamic<T extends AnySingleStoreDropMilestoneBase> = SingleStoreDropMilestone<
	T['_']['milestone'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnySingleStoreDropMilestoneBase = SingleStoreDropMilestoneBase<any, any, any, any, any>;

export interface SingleStoreDropMilestoneBase<
	TMilestone extends string,
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly milestone: TMilestone;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class SingleStoreDropMilestoneBase<
	TMilestone extends string,
	TQueryResult extends SingleStoreQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'SingleStoreDropMilestone';

	private config: SingleStoreDropMilestoneConfig;

	constructor(
		private milestone: TMilestone,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
	) {
		super();
		this.config = { milestone };
	}

	// TODO(singlestore): docs
	for(database: string): SingleStoreDropMilestoneWithout<this, TDynamic, 'for'> {
		this.config.database = database;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDropMilestoneQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): SingleStoreDropMilestonePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
		) as SingleStoreDropMilestonePrepare<this>;
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

	$dynamic(): SingleStoreDropMilestoneDynamic<this> {
		return this as any;
	}
}
