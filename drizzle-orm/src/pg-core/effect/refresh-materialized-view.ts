import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
import { PgRefreshMaterializedView } from '../query-builders/refresh-materialized-view.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PgEffectRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<PgQueryResultKind<TQueryResult, never>, TEffectHKT['error'], TEffectHKT['context']> {}

export class PgEffectRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgRefreshMaterializedView<TQueryResult>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRefreshMaterializedView';

	declare protected session: PgEffectSession<TEffectHKT, any, any, any, any>;

	/** @internal */
	_prepare(name?: string): PgEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		},
		TEffectHKT
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
		});
	}

	prepare(name: string): PgEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		},
		TEffectHKT
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyEffectWrapper(PgEffectRefreshMaterializedView);
