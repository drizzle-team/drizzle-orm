import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { PgSelectBase, type PgSelectBuilder } from '../query-builders/select.ts';
import type { PgSelectHKTBase, SelectedFields } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgEffectPreparedQuery, PgEffectRuntimeHKT, PgEffectSession } from './session.ts';

export type PgEffectSelectPrepare<
	T extends AnyPgEffectSelect,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	},
	TEffectHKT
>;

export type PgEffectSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgSelectBuilder<TSelection, PgEffectSelectHKT<TEffectHKT>>;

export type PgEffectSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = PgEffectSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never
>;

export interface PgEffectSelectHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgSelectHKTBase {
	runtime: PgEffectRuntimeHKT<TEffectHKT>;
	_type: PgEffectSelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>,
		TEffectHKT
	>;
}

export interface PgEffectSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection | undefined,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	// oxlint-disable-next-line no-unused-vars
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
		Assume<TSelection, ColumnsSelection>,
		TNullabilityMap
	>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']> {
}

export class PgEffectSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection | undefined,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
		Assume<TSelection, ColumnsSelection>,
		TNullabilityMap
	>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgSelectBase<
	PgEffectSelectHKT<TEffectHKT>,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'PgEffectSelectQueryBuilder';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;
}

applyMixins(PgEffectSelectBase, [RunnableQueryMixin]);
applyEffectWrapper(PgEffectSelectBase);

export type AnyPgEffectSelect = PgEffectSelectBase<any, any, any, any, any, any, any, any, any>;
