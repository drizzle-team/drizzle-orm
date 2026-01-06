import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, type NeonAuthToken } from '~/utils.ts';
import { PgRefreshMaterializedView } from '../query-builders/refresh-materialized-view.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PgAsyncRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends QueryPromise<PgQueryResultKind<TQueryResult, never>>
{}

export class PgAsyncRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends PgRefreshMaterializedView<TQueryResult>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>
{
	static override readonly [entityKind]: string = 'PgAsyncRefreshMaterializedView';

	declare protected session: PgAsyncSession;

	/** @internal */
	_prepare(name?: string): PgAsyncPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true).setToken(
				this.authToken,
			);
		});
	}

	prepare(name: string): PgAsyncPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyMixins(PgAsyncRefreshMaterializedView, [QueryPromise]);
