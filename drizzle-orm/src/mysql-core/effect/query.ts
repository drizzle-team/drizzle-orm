import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { applyMixins } from '~/utils.ts';
import { MySqlRelationalQuery, type MySqlRelationalQueryHKTBase } from '../query-builders/query.ts';
import { MySqlRunnableQuery } from '../query-builders/runnable.ts';
import type { MySqlEffectRuntimeHKT, MySqlEffectSession } from './session.ts';

export type AnyMySqlEffectRelationalQuery = MySqlEffectRelationalQuery<any, any>;

export interface MySqlEffectRelationalQueryHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRelationalQueryHKTBase
{
	runtime: MySqlEffectRuntimeHKT<TEffectHKT>;
	_type: MySqlEffectRelationalQuery<this['result'], TEffectHKT>;
}

export interface MySqlEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>
{}
export class MySqlEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRelationalQuery<MySqlEffectRelationalQueryHKT<TEffectHKT>, TResult>
{
	static override readonly [entityKind]: string = 'MySqlEffectRelationalQueryV2';

	declare protected session: MySqlEffectSession<TEffectHKT, any, any>;
}

applyMixins(MySqlEffectRelationalQuery, [MySqlRunnableQuery]);
applyEffectWrapper(MySqlEffectRelationalQuery);
