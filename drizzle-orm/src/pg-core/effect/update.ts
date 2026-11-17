import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import type { JoinNullability } from '~/query-builders/select.types.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { type Join, PgUpdateBase, type PgUpdateHKTBase } from '../query-builders/update.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgEffectPreparedQuery, PgEffectRuntimeHKT, PgEffectSession } from './session.ts';

export type PgEffectUpdatePrepare<
	T extends AnyPgEffectUpdate,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	},
	TEffectHKT
>;

export type PgEffectUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = PgTable | Subquery | PgViewBase | SQL | undefined,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TJoins extends Join[] = Join[],
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectUpdateBase<
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	true,
	never,
	TEffectHKT
>;

export interface PgEffectUpdateHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgUpdateHKTBase {
	runtime: PgEffectRuntimeHKT<TEffectHKT>;
	_type: PgEffectUpdateBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['from'], PgTable | Subquery | PgViewBase | SQL | undefined>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		Assume<this['joins'], Join[]>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnyPgEffectUpdate = PgEffectUpdateBase<any, any, any, any, any, any, any, any, any, any>;

export interface PgEffectUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends
	Effect.Effect<
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
		TEffectHKT['error'],
		TEffectHKT['context']
	>
{
}

export class PgEffectUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgUpdateBase<
	PgEffectUpdateHKT<TEffectHKT>,
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'> {
	static override readonly [entityKind]: string = 'PgEffectUpdate';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;
}

applyMixins(PgEffectUpdateBase, [RunnableQueryMixin]);
applyEffectWrapper(PgEffectUpdateBase);
