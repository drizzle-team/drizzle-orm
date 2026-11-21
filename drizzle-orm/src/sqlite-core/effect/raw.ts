import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';

export interface SQLiteEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteRaw<TResult>, QueryEffectKind<TEffectHKT, TResult>, SQLWrapper
{
	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, TResult>;
}

export class SQLiteEffectRaw<
	TResult,
	// oxlint-disable-next-line no-unused-vars
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLiteRaw<TResult> implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteEffectRaw';
}

applyEffectWrapper(SQLiteEffectRaw);
