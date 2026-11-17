import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind } from '~/pg-core/session.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { applyMixins } from '~/utils.ts';
import { PgRefreshMaterializedView } from '../query-builders/refresh-materialized-view.ts';
import type { PgEffectRuntimeHKT, PgEffectSession } from './session.ts';

export interface PgEffectRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<PgQueryResultKind<TQueryResult, never>, TEffectHKT['error'], TEffectHKT['context']> {}

export class PgEffectRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgRefreshMaterializedView<TQueryResult, PgEffectRuntimeHKT<TEffectHKT>>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRefreshMaterializedView';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;
}

applyMixins(PgEffectRefreshMaterializedView, [RunnableQueryMixin]);
applyEffectWrapper(PgEffectRefreshMaterializedView);
