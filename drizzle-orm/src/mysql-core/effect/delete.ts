import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { MySqlDeleteBase, type MySqlDeleteHKTBase } from '~/mysql-core/query-builders/delete.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { Assume } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { MySqlEffectPreparedQuery, MySqlEffectSession } from './session.ts';

export type MySqlEffectDelete<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectDeleteBase<TTable, TQueryResult, true, never, TEffectHKT>;

export type MySqlEffectDeletePrepare<
	T extends AnyMySqlEffectDelete,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: MySqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	TEffectHKT
>;

export type AnyMySqlEffectDelete = MySqlEffectDeleteBase<any, any, any, any, any>;

export interface MySqlEffectDeleteHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlDeleteHKTBase
{
	_type: MySqlEffectDeleteBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export interface MySqlEffectDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<MySqlQueryResultKind<TQueryResult, never>, TEffectHKT['error'], TEffectHKT['context']> {}

export class MySqlEffectDeleteBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends MySqlDeleteBase<MySqlEffectDeleteHKT<TEffectHKT>, TTable, TQueryResult, TDynamic, TExcludedMethods> {
	static override readonly [entityKind]: string = 'MySqlEffectDelete';

	declare protected session: MySqlEffectSession<TEffectHKT, TQueryResult, any>;

	prepare(): MySqlEffectDeletePrepare<this, TEffectHKT> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'raw',
			undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as MySqlEffectDeletePrepare<this, TEffectHKT>;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(MySqlEffectDeleteBase);
