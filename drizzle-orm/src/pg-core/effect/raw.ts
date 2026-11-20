import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { PgRaw } from '../query-builders/raw.ts';
import type { PgEffectRuntimeHKT } from './session.ts';

export interface PgEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>, SQLWrapper
{}
export class PgEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRaw<TResult, PgEffectRuntimeHKT<TEffectHKT>>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};
}

applyEffectWrapper(PgEffectRaw);
