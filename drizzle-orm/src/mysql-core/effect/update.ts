import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { MySqlUpdateBase, type MySqlUpdateHKTBase } from '~/mysql-core/query-builders/update.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { Assume } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { MySqlEffectPreparedQuery, MySqlEffectSession } from './session.ts';

export type MySqlEffectUpdate<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectUpdateBase<TTable, TQueryResult, true, never, TEffectHKT>;

export type MySqlEffectUpdatePrepare<
	T extends AnyMySqlEffectUpdate,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: MySqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	TEffectHKT
>;

export type AnyMySqlEffectUpdate = MySqlEffectUpdateBase<any, any, any, any, any>;

export interface MySqlEffectUpdateHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlUpdateHKTBase
{
	_type: MySqlEffectUpdateBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export interface MySqlEffectUpdateBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<MySqlQueryResultKind<TQueryResult, never>, TEffectHKT['error'], TEffectHKT['context']> {}

export class MySqlEffectUpdateBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends MySqlUpdateBase<MySqlEffectUpdateHKT<TEffectHKT>, TTable, TQueryResult, TDynamic, TExcludedMethods> {
	static override readonly [entityKind]: string = 'MySqlEffectUpdate';

	declare protected session: MySqlEffectSession<TEffectHKT, TQueryResult, any>;

	prepare(): MySqlEffectUpdatePrepare<this, TEffectHKT> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'raw',
			undefined,
			{
				type: 'update',
				tables: extractUsedTable(this.config.table),
			},
		) as MySqlEffectUpdatePrepare<this, TEffectHKT>;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(MySqlEffectUpdateBase);
