import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { PgCountBuilder } from '../query-builders/count.ts';
import type { PgEffectRuntimeHKT, PgEffectSession } from './session.ts';

export interface PgEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends
		PgCountBuilder<PgEffectRuntimeHKT<TEffectHKT>>,
		Effect.Effect<number, TEffectHKT['error'], TEffectHKT['context']>
{}

export class PgEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgCountBuilder<PgEffectRuntimeHKT<TEffectHKT>>
{
	static override readonly [entityKind]: string = 'PgEffectCountBuilder';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;
}

applyEffectWrapper(PgEffectCountBuilder);
