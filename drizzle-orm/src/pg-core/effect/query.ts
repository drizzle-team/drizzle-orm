import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { applyMixins } from '~/utils.ts';
import { PgRelationalQuery, type PgRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { PgEffectRuntimeHKT, PgEffectSession } from './session.ts';

export type AnyPgEffectRelationalQuery = PgEffectRelationalQuery<any, any>;

export interface PgEffectRelationalQueryHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRelationalQueryHKTBase
{
	runtime: PgEffectRuntimeHKT<TEffectHKT>;
	_type: PgEffectRelationalQuery<this['result'], TEffectHKT>;
}

export interface PgEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>
{
}
export class PgEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRelationalQuery<PgEffectRelationalQueryHKT<TEffectHKT>, TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRelationalQueryV2';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;
}

applyMixins(PgEffectRelationalQuery, [RunnableQueryMixin]);
applyEffectWrapper(PgEffectRelationalQuery);
