import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind } from '~/pg-core/session.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { applyMixins } from '~/utils.ts';
import { PgRefreshMaterializedView } from '../query-builders/refresh-materialized-view.ts';
import { PgRunnableQuery } from '../query-builders/runnable.ts';
import type { PgAsyncRuntimeHKT, PgAsyncSession } from './session.ts';

export interface PgAsyncRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends QueryPromise<PgQueryResultKind<TQueryResult, never>>
{}

export class PgAsyncRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends PgRefreshMaterializedView<TQueryResult, PgAsyncRuntimeHKT>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>
{
	static override readonly [entityKind]: string = 'PgAsyncRefreshMaterializedView';

	declare protected session: PgAsyncSession;
}

applyMixins(PgAsyncRefreshMaterializedView, [QueryPromise, PgRunnableQuery]);
