import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
import { PgRefreshMaterializedView } from '../query-builders/refresh-materialized-view.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PgEffectRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends QueryEffect<PgQueryResultKind<TQueryResult, never>>
{}

export class PgEffectRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends PgRefreshMaterializedView<TQueryResult>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRefreshMaterializedView';

	declare protected session: PgEffectSession;

	/** @internal */
	_prepare(name?: string): PgEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
		});
	}

	prepare(name: string): PgEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
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

applyEffectWrapper(PgEffectRefreshMaterializedView);
