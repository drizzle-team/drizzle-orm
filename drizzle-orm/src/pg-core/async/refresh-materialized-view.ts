import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins } from '~/utils.ts';
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
	_prepare(name?: string, generateName = false): PgAsyncPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const query = this.dialect.sqlToQuery(this.getSQL());
			return this.session.prepareQuery(
				query,
				'raw',
				name ?? generateName,
			);
		});
	}

	prepare(name?: string): PgAsyncPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyMixins(PgAsyncRefreshMaterializedView, [QueryPromise]);
