import type { PgDialect } from '~/pg-core/dialect';
import type { PgSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT, QueryResultKind } from '~/pg-core/session';
import type { PgMaterializedView } from '~/pg-core/view';
import { QueryPromise } from '~/query-promise';
import type { Query, SQL } from '~/sql';
import type { Simplify } from '~/utils';

export type PgRMVWithFilteredMethods<
	T extends PgRefreshMaterializedView<any, any>,
	TNewExcludedMethods extends string,
> = T extends PgRefreshMaterializedView<infer TQueryResult, infer TExcludedMethods> ? Omit<
		PgRefreshMaterializedView<TQueryResult, TExcludedMethods | TNewExcludedMethods>,
		TExcludedMethods | TNewExcludedMethods
	>
	: never;

export interface PgRefreshMaterializedView<
	TQueryResult extends QueryResultHKT,
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> {}

export class PgRefreshMaterializedView<TQueryResult extends QueryResultHKT>
	extends QueryPromise<QueryResultKind<TQueryResult, never>>
{
	private config: {
		view: PgMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: PgMaterializedView,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { view };
	}

	concurrently(): PgRMVWithFilteredMethods<this, 'concurrently' | 'withNoData'> {
		this.config.concurrently = true;
		return this as any;
	}

	withNoData(): PgRMVWithFilteredMethods<this, 'concurrently' | 'withNoData'> {
		this.config.withNoData = true;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildRefreshMaterializedViewQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: QueryResultKind<TQueryResult, never>;
		}
	> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: QueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
