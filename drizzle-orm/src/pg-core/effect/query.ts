import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { PgRelationalQuery, type PgRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export type AnyPgEffectRelationalQuery = PgEffectRelationalQuery<any, any>;

export interface PgEffectRelationalQueryHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRelationalQueryHKTBase
{
	_type: PgEffectRelationalQuery<this['result'], TEffectHKT>;
}

export interface PgEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>
{}
export class PgEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRelationalQuery<PgEffectRelationalQueryHKT<TEffectHKT>, TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRelationalQueryV2';

	declare protected session: PgEffectSession<TEffectHKT, any, any, any, any>;

	/** @internal */
	_prepare(
		name?: string,
		generateName = false,
	): PgEffectPreparedQuery<PreparedQueryConfig & { execute: TResult }, TEffectHKT> {
		const { query, builtQuery } = this._toSQL();

		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: this.parseJson,
			parseJsonIfString: false,
			rootJsonMappers: false,
			selection: query.selection,
		});

		return this.session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
			builtQuery,
			'objects',
			name ?? generateName,
			mapper,
		);
	}

	prepare(name?: string): PgEffectPreparedQuery<PreparedQueryConfig & { execute: TResult }, TEffectHKT> {
		return this._prepare(name, true);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this._prepare().execute(placeholderValues);
	}
}

applyEffectWrapper(PgEffectRelationalQuery);
