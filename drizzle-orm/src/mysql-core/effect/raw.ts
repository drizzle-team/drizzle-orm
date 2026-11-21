import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { MySqlRaw } from '../query-builders/raw.ts';
import type { MySqlEffectRuntimeHKT } from './session.ts';

export interface MySqlEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends QueryEffectKind<TEffectHKT, TResult>, SQLWrapper
{}

export class MySqlEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRaw<TResult, MySqlEffectRuntimeHKT<TEffectHKT>>
	implements RunnableQuery<TResult, 'mysql'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'MySqlEffectRaw';

	declare readonly _: {
		readonly dialect: 'mysql';
		readonly result: TResult;
	};
}

applyEffectWrapper(MySqlEffectRaw);
