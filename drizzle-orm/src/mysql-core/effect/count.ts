import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { MySqlCountBuilder } from '../query-builders/count.ts';
import type { MySqlEffectRuntimeHKT, MySqlEffectSession } from './session.ts';

export interface MySqlEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends
		MySqlCountBuilder<MySqlEffectRuntimeHKT<TEffectHKT>>,
		Effect.Effect<number, TEffectHKT['error'], TEffectHKT['context']>
{}

export class MySqlEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlCountBuilder<MySqlEffectRuntimeHKT<TEffectHKT>>
{
	static override readonly [entityKind]: string = 'MySqlEffectCountBuilder';

	declare protected session: MySqlEffectSession<TEffectHKT, any, any>;
}

applyEffectWrapper(MySqlEffectCountBuilder);
