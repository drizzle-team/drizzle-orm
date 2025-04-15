import { entityKind } from '~/entity.ts';
import type { GelDialect } from '~/gel-core/dialect.ts';
import type {
	GelPreparedQuery,
	GelQueryResultHKT,
	GelQueryResultKind,
	GelSession,
	PreparedQueryConfig,
} from '~/gel-core/session.ts';
import type { GelMaterializedView } from '~/gel-core/view.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GelRefreshMaterializedView<TQueryResult extends GelQueryResultHKT>
	extends
		QueryPromise<GelQueryResultKind<TQueryResult, never>>,
		RunnableQuery<GelQueryResultKind<TQueryResult, never>, 'gel'>,
		SQLWrapper
{
	readonly _: {
		readonly dialect: 'gel';
		readonly result: GelQueryResultKind<TQueryResult, never>;
	};
}

export class GelRefreshMaterializedView<TQueryResult extends GelQueryResultHKT>
	extends QueryPromise<GelQueryResultKind<TQueryResult, never>>
	implements RunnableQuery<GelQueryResultKind<TQueryResult, never>, 'gel'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'GelRefreshMaterializedView';

	private config: {
		view: GelMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: GelMaterializedView,
		private session: GelSession,
		private dialect: GelDialect,
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
	_prepare(name?: string): GelPreparedQuery<
		PreparedQueryConfig & {
			execute: GelQueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
		});
	}

	prepare(name: string): GelPreparedQuery<
		PreparedQueryConfig & {
			execute: GelQueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}
