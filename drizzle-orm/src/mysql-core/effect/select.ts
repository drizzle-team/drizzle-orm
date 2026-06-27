import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';
import { MySqlSelectBase, type MySqlSelectBuilder } from '../query-builders/select.ts';
import type { MySqlSelectHKTBase, SelectedFields } from '../query-builders/select.types.ts';
import type { MySqlPreparedQueryConfig } from '../session.ts';
import type { MySqlEffectPreparedQuery, MySqlEffectSession } from './session.ts';

export type MySqlEffectSelectPrepare<
	T extends AnyMySqlEffectSelect,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlEffectPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: T['_']['result'];
		iterator: T['_']['result'][number];
	},
	TEffectHKT
>;

export type MySqlEffectSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = MySqlSelectBuilder<TSelection, MySqlEffectSelectHKT<TEffectHKT>>;

export type MySqlEffectSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = MySqlEffectSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never
>;

export interface MySqlEffectSelectHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlSelectHKTBase
{
	_type: MySqlEffectSelectBase<
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

export interface MySqlEffectSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']> {
}

export class MySqlEffectSelectBase<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends MySqlSelectBase<
	MySqlEffectSelectHKT<TEffectHKT>,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'MySqlEffectSelectQueryBuilder';

	declare readonly session: MySqlEffectSession<TEffectHKT, any, any>;

	prepare(): MySqlEffectSelectPrepare<this, TEffectHKT> {
		const query = this.dialect.sqlToQuery(this.getSQL());
		const fieldsList = this.config.fieldsFlat!;
		const mapper = this.dialect.mapperGenerators.rows(fieldsList, this.joinsNotNullableMap);

		const preparedQuery = this.session.prepareQuery<
			MySqlPreparedQueryConfig & { execute: any }
		>(query, 'arrays', mapper, {
			type: 'select',
			tables: [...this.usedTables],
		}, this.cacheConfig);

		return preparedQuery as MySqlEffectSelectPrepare<this, TEffectHKT>;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues?: Record<string, unknown>) => {
		return this.prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(MySqlEffectSelectBase);

export type AnyMySqlEffectSelect = MySqlEffectSelectBase<any, any, any, any, any, any, any, any, any>;
