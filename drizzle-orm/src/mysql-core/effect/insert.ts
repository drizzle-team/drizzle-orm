import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { MySqlInsertBase, type MySqlInsertHKTBase } from '~/mysql-core/query-builders/insert.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Assume } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { MySqlEffectPreparedQuery, MySqlEffectSession } from './session.ts';

export interface MySqlEffectInsertHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlInsertHKTBase
{
	_type: MySqlEffectInsertBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnyMySqlEffectInsert = MySqlEffectInsertBase<any, any, any, any, any>;

export type MySqlEffectInsertPrepare<
	T extends AnyMySqlEffectInsert,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: TReturning extends undefined ? MySqlQueryResultKind<T['_']['queryResult'], never> : TReturning[];
		iterator: never;
	},
	TEffectHKT
>;

export type MySqlEffectInsert<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectInsertBase<TTable, TQueryResult, TReturning, true, never, TEffectHKT>;

export interface MySqlEffectInsertBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends
	Effect.Effect<
		TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[],
		TEffectHKT['error'],
		TEffectHKT['context']
	>
{}

export class MySqlEffectInsertBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends MySqlInsertBase<
	MySqlEffectInsertHKT<TEffectHKT>,
	TTable,
	TQueryResult,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements
	RunnableQuery<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[], 'mysql'>
{
	static override readonly [entityKind]: string = 'MySqlEffectInsert';

	declare protected session: MySqlEffectSession<TEffectHKT, TQueryResult, any>;

	/** @internal */
	_prepare(): MySqlEffectInsertPrepare<this, TReturning, TEffectHKT> {
		const { sql, generatedIds } = this.dialect.buildInsertQuery(this.config);
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(sql),
			'raw',
			this.dialect.mapperGenerators.$returning(this.config.returning, generatedIds),
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
		) as MySqlEffectInsertPrepare<this, TReturning, TEffectHKT>;
	}

	prepare(): MySqlEffectInsertPrepare<this, TReturning, TEffectHKT> {
		return this._prepare();
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(MySqlEffectInsertBase);
