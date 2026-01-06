import type { CockroachDialect } from '~/cockroach-core/dialect.ts';
import type {
	CockroachPreparedQuery,
	CockroachQueryResultHKT,
	CockroachQueryResultKind,
	CockroachSession,
	PreparedQueryConfig,
} from '~/cockroach-core/session.ts';
import type { CockroachMaterializedView } from '~/cockroach-core/view.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CockroachRefreshMaterializedView<TQueryResult extends CockroachQueryResultHKT>
	extends
		QueryPromise<CockroachQueryResultKind<TQueryResult, never>>,
		RunnableQuery<CockroachQueryResultKind<TQueryResult, never>, 'cockroach'>,
		SQLWrapper
{
	readonly _: {
		readonly dialect: 'cockroach';
		readonly result: CockroachQueryResultKind<TQueryResult, never>;
	};
}

export class CockroachRefreshMaterializedView<TQueryResult extends CockroachQueryResultHKT>
	extends QueryPromise<CockroachQueryResultKind<TQueryResult, never>>
	implements RunnableQuery<CockroachQueryResultKind<TQueryResult, never>, 'cockroach'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachRefreshMaterializedView';

	private config: {
		view: CockroachMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: CockroachMaterializedView,
		private session: CockroachSession,
		private dialect: CockroachDialect,
	) {
		super();
		this.config = { view };
	}

	concurrently(): this {
		if (this.config.withNoData !== undefined) {
			throw new Error('Cannot use concurrently and withNoData together');
		}
		this.config.concurrently = true;
		return this;
	}

	withNoData(): this {
		if (this.config.concurrently !== undefined) {
			throw new Error('Cannot use concurrently and withNoData together');
		}
		this.config.withNoData = true;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildRefreshMaterializedViewQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): CockroachPreparedQuery<
		PreparedQueryConfig & {
			execute: CockroachQueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
		});
	}

	prepare(name: string): CockroachPreparedQuery<
		PreparedQueryConfig & {
			execute: CockroachQueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues, this.authToken);
		});
	};
}
