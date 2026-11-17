import { entityKind } from '~/entity.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { MySqlSelectBase, type MySqlSelectBuilder } from '../query-builders/select.ts';
import type { MySqlSelectHKTBase, SelectedFields } from '../query-builders/select.types.ts';
import type { MySqlPreparedQueryConfig } from '../session.ts';
import { MySqlAsyncIterableQuery } from './iterable.ts';
import type { MySqlAsyncPreparedQuery, MySqlAsyncRuntimeHKT, MySqlAsyncSession } from './session.ts';

export type MySqlAsyncSelectPrepare<T extends AnyMySqlAsyncSelect> = MySqlAsyncPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: T['_']['result'];
		iterator: T['_']['result'][number];
	}
>;

export type MySqlAsyncSelectBuilder<
	TSelection extends SelectedFields | undefined,
> = MySqlSelectBuilder<TSelection, MySqlAsyncSelectHKT>;

export type MySqlAsyncSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = MySqlAsyncSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never
>;

export interface MySqlAsyncSelectHKT extends MySqlSelectHKTBase {
	runtime: MySqlAsyncRuntimeHKT;
	_type: MySqlAsyncSelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface MySqlAsyncSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends
	MySqlSelectBase<
		MySqlAsyncSelectHKT,
		TTableName,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	QueryPromise<TResult>
{
	/**
	 * Runs the query and returns an async iterator over it's rows, with values for any `sql.placeholder()` it contains.
	 * Streams rows when the driver supports it
	 */
	iterator(
		placeholderValues?: Record<string, unknown>,
	): AsyncGenerator<TResult extends readonly (infer TRow)[] ? TRow : never>;
}

export class MySqlAsyncSelectBase<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends MySqlSelectBase<
	MySqlAsyncSelectHKT,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'MySqlSelect';

	declare readonly session: MySqlAsyncSession<any, any>;
}

applyMixins(MySqlAsyncSelectBase, [QueryPromise, RunnableQueryMixin, MySqlAsyncIterableQuery]);

export type AnyMySqlAsyncSelect = MySqlAsyncSelectBase<any, any, any, any, any, any, any, any>;
