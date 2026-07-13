import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { PgRaw } from '../query-builders/raw.ts';
import type { PgEffectPreparedQuery } from './session.ts';

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

	declare protected prepared: PgEffectPreparedQuery<{
		execute: TResult;
	}, TEffectHKT>;

	constructor(
		prepared: PgEffectPreparedQuery<{
			execute: TResult;
		}, TEffectHKT>,
		sql: SQL,
		query: Query,
	) {
		super(prepared, sql, query);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.prepared.execute(placeholderValues);
	}

	override _prepare() {
		return this.prepared;
	}
}

applyEffectWrapper(PgEffectRaw);
