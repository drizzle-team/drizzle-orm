import { entityKind } from '~/entity.ts';
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
import type { MySqlAsyncPreparedQuery, MySqlAsyncSession } from './session.ts';

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
{}

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

	prepare(): MySqlAsyncSelectPrepare<this> {
		// Build query before accessing `fieldsFlat` - build mutates it
		const query = this.dialect.sqlToQuery(this.getSQL());
		const fieldsList = this.config.fieldsFlat!;
		const mapper = this.dialect.mapperGenerators.rows(fieldsList, this.joinsNotNullableMap);

		const preparedQuery = this.session.prepareQuery<
			MySqlPreparedQueryConfig & { execute: TResult[] }
		>(query, 'arrays', mapper, {
			type: 'select',
			tables: [...this.usedTables],
		}, this.cacheConfig);

		return preparedQuery as MySqlAsyncSelectPrepare<this>;
	}

	execute = ((placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	}) as ReturnType<this['prepare']>['execute'];

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();
}

applyMixins(MySqlAsyncSelectBase, [QueryPromise]);

export type AnyMySqlAsyncSelect = MySqlAsyncSelectBase<any, any, any, any, any, any, any, any>;
