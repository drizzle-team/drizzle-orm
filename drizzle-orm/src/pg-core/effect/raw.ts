import type { Effect } from 'effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { PgRaw } from '../query-builders/raw.ts';

export interface PgEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>, RunnableQuery<TResult, 'pg'>, SQLWrapper
{}
export class PgEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgRaw<TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		public execute: () => Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>,
		sql: SQL,
		query: Query,
		mapBatchResult: (result: unknown) => unknown,
	) {
		super(sql, query, mapBatchResult);
	}

	_prepare(): PreparedQuery {
		return this;
	}
}

applyEffectWrapper(PgEffectRaw);
