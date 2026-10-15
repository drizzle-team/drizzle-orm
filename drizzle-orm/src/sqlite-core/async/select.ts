import { entityKind } from '~/entity.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { SQLiteSelectBase, type SQLiteSelectBuilder } from '~/sqlite-core/query-builders/select.ts';
import type { SelectedFields, SQLiteSelectHKTBase } from '~/sqlite-core/query-builders/select.types.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncPreparedQueryConfig, SQLiteAsyncSession } from './session.ts';

export type SQLiteAsyncSelectExecute<T extends AnySQLiteAsyncSelect> = T['_']['result'];

export type SQLiteAsyncSelectPrepare<T extends AnySQLiteAsyncSelect> = SQLiteAsyncPreparedQuery<
	SQLiteAsyncPreparedQueryConfig & {
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['result'];
		get: T['_']['result'][number] | undefined;
		values: any[][];
		execute: SQLiteAsyncSelectExecute<T>;
	}
>;

export type SQLiteAsyncSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
> = SQLiteSelectBuilder<TSelection, TRunResult, SQLiteAsyncSelectHKT & { resultType: TResultType }>;

export type SQLiteAsyncSelect<
	TTableName extends string | undefined = string | undefined,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = SQLiteAsyncSelectBase<TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap, true, never>;

export interface SQLiteAsyncSelectHKT extends SQLiteSelectHKTBase {
	_type: SQLiteAsyncSelectBase<
		this['tableName'],
		Assume<this['resultType'], 'sync' | 'async'>,
		this['runResult'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface SQLiteAsyncSelectBase<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	// oxlint-disable-next-line no-unused-vars
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends
	SQLiteSelectBase<
		SQLiteAsyncSelectHKT & { resultType: TResultType },
		TTableName,
		TRunResult,
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
	readonly _:
		& SQLiteSelectBase<
			SQLiteAsyncSelectHKT & { resultType: TResultType },
			TTableName,
			TRunResult,
			TSelection,
			TSelectMode,
			TNullabilityMap,
			TDynamic,
			TExcludedMethods,
			TResult,
			TSelectedFields
		>['_']
		& { readonly resultType: TResultType };
}

export class SQLiteAsyncSelectBase<
	TTableName extends string | undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends SQLiteSelectBase<
	SQLiteAsyncSelectHKT & { resultType: TResultType },
	TTableName,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteAsyncSelect';

	declare protected session: SQLiteAsyncSession<TResultType, TRunResult, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteAsyncSelectPrepare<this> {
		// Build query before accessing `fieldsFlat` - build mutates it
		const query = this.dialect.sqlToQuery(this.getSQL());
		const fieldsList = this.config.fieldsFlat!;
		const mapper = this.dialect.mapperGenerators.rows(fieldsList, this.joinsNotNullableMap);

		const preparedQuery = this.session.prepareQuery(
			query,
			'arrays',
			prepare,
			'all',
			mapper,
			{
				type: 'select',
				tables: [...this.usedTables],
			},
			this.cacheConfig,
		);
		return preparedQuery as ReturnType<this['prepare']>;
	}

	prepare(): SQLiteAsyncSelectPrepare<this> {
		return this._prepare(true);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};

	async execute(): Promise<SQLiteAsyncSelectExecute<this>> {
		return this._prepare().execute() as Promise<SQLiteAsyncSelectExecute<this>>;
	}
}

applyMixins(SQLiteAsyncSelectBase, [QueryPromise]);

export type AnySQLiteAsyncSelect = SQLiteAsyncSelectBase<any, any, any, any, any, any, any, any, any, any>;
