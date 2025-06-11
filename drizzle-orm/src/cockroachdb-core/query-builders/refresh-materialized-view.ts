import type { CockroachDbDialect } from '~/cockroachdb-core/dialect.ts';
import type {
	CockroachDbPreparedQuery,
	CockroachDbQueryResultHKT,
	CockroachDbQueryResultKind,
	CockroachDbSession,
	PreparedQueryConfig,
} from '~/cockroachdb-core/session.ts';
import type { CockroachDbMaterializedView } from '~/cockroachdb-core/view.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CockroachDbRefreshMaterializedView<TQueryResult extends CockroachDbQueryResultHKT>
	extends
		QueryPromise<CockroachDbQueryResultKind<TQueryResult, never>>,
		RunnableQuery<CockroachDbQueryResultKind<TQueryResult, never>, 'cockroachdb'>,
		SQLWrapper
{
	readonly _: {
		readonly dialect: 'cockroachdb';
		readonly result: CockroachDbQueryResultKind<TQueryResult, never>;
	};
}

export class CockroachDbRefreshMaterializedView<TQueryResult extends CockroachDbQueryResultHKT>
	extends QueryPromise<CockroachDbQueryResultKind<TQueryResult, never>>
	implements RunnableQuery<CockroachDbQueryResultKind<TQueryResult, never>, 'cockroachdb'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachDbRefreshMaterializedView';

	private config: {
		view: CockroachDbMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: CockroachDbMaterializedView,
		private session: CockroachDbSession,
		private dialect: CockroachDbDialect,
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
	_prepare(name?: string): CockroachDbPreparedQuery<
		PreparedQueryConfig & {
			execute: CockroachDbQueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
		});
	}

	prepare(name: string): CockroachDbPreparedQuery<
		PreparedQueryConfig & {
			execute: CockroachDbQueryResultKind<TQueryResult, never>;
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
