import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { SQLiteCountBuilder } from '~/sqlite-core/query-builders/count.ts';
import type { SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteCountBuilder, QueryEffectKind<TEffectHKT, number>
{
	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, number>;
}

export class SQLiteEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteCountBuilder
{
	static override readonly [entityKind]: string = 'SQLiteEffectCountBuilder';

	declare protected session: SQLiteEffectSession<any, TEffectHKT, any>;
}

applyEffectWrapper(SQLiteEffectCountBuilder);
