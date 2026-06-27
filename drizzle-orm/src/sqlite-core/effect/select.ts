import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { SQLiteSelectBase, type SQLiteSelectBuilder } from '~/sqlite-core/query-builders/select.ts';
import type { SelectedFields, SQLiteSelectHKTBase } from '~/sqlite-core/query-builders/select.types.ts';
import type { PreparedQueryConfig } from '~/sqlite-core/session.ts';
import type { Assume } from '~/utils.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export type SQLiteEffectSelectExecute<T extends AnySQLiteEffectSelect> = T['_']['result'];

export type SQLiteEffectSelectPrepare<
	T extends AnySQLiteEffectSelect,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['runResult'];
		all: T['_']['result'];
		get: T['_']['result'][number] | undefined;
		values: any[][];
		execute: SQLiteEffectSelectExecute<T>;
	},
	TEffectHKT
>;

export type SQLiteEffectSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteSelectBuilder<TSelection, TRunResult, SQLiteEffectSelectHKT<TEffectHKT>>;

export type SQLiteEffectSelect<
	TTableName extends string | undefined = string | undefined,
	TRunResult = unknown,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = SQLiteEffectSelectBase<TTableName, TRunResult, TSelection, TSelectMode, TNullabilityMap, true, never>;

export interface SQLiteEffectSelectHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteSelectHKTBase
{
	_type: SQLiteEffectSelectBase<
		this['tableName'],
		this['runResult'],
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

export interface SQLiteEffectSelectBase<
	TTableName extends string | undefined,
	// oxlint-disable-next-line no-unused-vars
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
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends QueryEffectKind<TEffectHKT, TResult> {}

export class SQLiteEffectSelectBase<
	TTableName extends string | undefined,
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLiteSelectBase<
	SQLiteEffectSelectHKT<TEffectHKT>,
	TTableName,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'SQLiteEffectSelect';

	declare protected session: SQLiteEffectSession<TRunResult, TEffectHKT, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteEffectSelectPrepare<this, TEffectHKT> {
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

	prepare(): SQLiteEffectSelectPrepare<this, TEffectHKT> {
		return this._prepare(true);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().values(placeholderValues);
	};

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(SQLiteEffectSelectBase);

export type AnySQLiteEffectSelect = SQLiteEffectSelectBase<any, any, any, any, any, any, any, any, any, any>;
