import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { MySqlRelationalQuery, type MySqlRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { MySqlPreparedQueryConfig } from '../session.ts';
import type { MySqlEffectPreparedQuery, MySqlEffectSession } from './session.ts';

export type AnyMySqlEffectRelationalQuery = MySqlEffectRelationalQuery<any, any>;

export interface MySqlEffectRelationalQueryHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRelationalQueryHKTBase
{
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

	prepare() {
		const { query, builtQuery } = this._toSQL();
		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: false,
			arrayModeRoot: true,
			selection: query.selection,
		});

		return this.session.prepareQuery(
			builtQuery,
			'arrays',
			mapper,
		) as MySqlEffectPreparedQuery<MySqlPreparedQueryConfig & { execute: TResult }, TEffectHKT>;
	}

	execute() {
		return this.prepare().execute();
	}
}

applyEffectWrapper(MySqlEffectRelationalQuery);
