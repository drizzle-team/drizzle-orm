import type { SqliteClient } from '@effect/sql-sqlite-node/SqliteClient';
import type { SqlError } from '@effect/sql/SqlError';
import type { Effect } from 'effect';
import { effectWrap } from '~/effect/effect-wrapper.ts';
import { entityKind, is } from '~/entity.ts';
import type { Assume } from '~/index.ts';
import { getTableColumns } from '~/index.ts';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { SQL } from '~/sql/sql.ts';
import type { SQLiteSelectExecute, SQLiteSelectQueryBuilderBase } from '~/sqlite-core';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteSelectBase } from '~/sqlite-core/query-builders/select.ts';
import type {
	AnySQLiteSelect,
	SelectedFields,
	SQLiteSelectQueryBuilderHKT,
} from '~/sqlite-core/query-builders/select.types.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { SQLiteViewBase } from '~/sqlite-core/view-base.ts';
import { Subquery } from '~/subquery.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { EffectSQLitePreparedQuery, EffectSQLiteSession } from '../session';

export type CreateEffectSQLiteSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? EffectSQLiteSelectBase<
		TTableName,
		TSelection,
		TSelectMode
	>
	: SQLiteSelectQueryBuilderBase<
		SQLiteSelectQueryBuilderHKT,
		TTableName,
		'sync',
		Record<string, unknown>[],
		TSelection,
		TSelectMode
	>;

export class EffectSQLiteSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	static readonly [entityKind]: string = 'EffectSQLiteSelectBuilder';

	private fields: TSelection;
	private session: EffectSQLiteSession<any, any, any> | undefined;
	private dialect: SQLiteDialect;
	private withList: Subquery[] | undefined;
	private distinct: boolean | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: EffectSQLiteSession<any, any, any> | undefined;
			dialect: SQLiteDialect;
			withList?: Subquery[];
			distinct?: boolean;
		},
	) {
		this.fields = config.fields;
		this.session = config.session;
		this.dialect = config.dialect;
		this.withList = config.withList;
		this.distinct = config.distinct;
	}

	from<TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL>(
		source: TFrom,
	): CreateEffectSQLiteSelectFromBuilderMode<
		TBuilderMode,
		GetSelectTableName<TFrom>,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	> {
		const isPartialSelect = !!this.fields;

		let fields: SelectedFields;
		if (this.fields) {
			fields = this.fields;
		} else if (is(source, Subquery)) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source._.selectedFields).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectedFields[string]]),
			);
		} else if (is(source, SQLiteViewBase)) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (is(source, SQL)) {
			fields = {};
		} else {
			fields = getTableColumns<SQLiteTable>(source);
		}

		return effectWrap(
			new EffectSQLiteSelectBase({
				table: source,
				fields,
				isPartialSelect,
				session: this.session,
				dialect: this.dialect,
				withList: this.withList,
				distinct: this.distinct,
			}),
		) as any;
	}
}

export interface EffectSQLiteSelectBase<
	TTableName extends string | undefined,
	TSelection extends Record<string, unknown>,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends Effect.Effect<TResult, SqlError, SqliteClient> {}

export class EffectSQLiteSelectBase<
	TTableName extends string | undefined,
	TSelection extends Record<string, unknown>,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> extends SQLiteSelectBase<
	TTableName,
	'sync',
	Record<string, unknown>[],
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'EffectSQLiteSelect';

	/** @deprecated Use `.effectRun()` for `Effect` compatibility */
	override run: any = () => {
		throw new Error('Use `.effectRun()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectAll()` for `Effect` compatibility */
	override all: any = () => {
		throw new Error('Use `.effectAll()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectGet()` for `Effect` compatibility */
	override get: any = () => {
		throw new Error('Use `.effectGet()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectValues()` for `Effect` compatibility */
	override values: any = () => {
		throw new Error('Use `.effectValues()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effect()` for `Effect` compatibility */
	override execute(): never {
		throw new Error('Use `.effect()` for `Effect` compatibility');
	}

	effectRun: ReturnType<this['effectPrepare']>['run'] = (placeholderValues?: Record<string, unknown>) => {
		return this.effectPrepare().run(placeholderValues) as any;
	};

	effectAll: ReturnType<this['effectPrepare']>['all'] = (placeholderValues?: Record<string, unknown>) => {
		return this.effectPrepare().all(placeholderValues) as any;
	};

	effectGet: ReturnType<this['effectPrepare']>['get'] = (placeholderValues?: Record<string, unknown>) => {
		return this.effectPrepare().get(placeholderValues) as any;
	};

	effectValues: ReturnType<this['effectPrepare']>['values'] = (placeholderValues?: Record<string, unknown>) => {
		return this.effectPrepare().values(placeholderValues) as any;
	};

	effect(placeholderValues?: Record<string, unknown>): Effect.Effect<TResult, SqlError, SqliteClient> {
		return this.effectPrepare().all(placeholderValues) as any;
	}

	effectPrepare(): EffectSQLiteSelectPrepare<Assume<this, AnySQLiteSelect>> {
		return this._prepare() as any;
	}
}

export type EffectSQLiteSelectPrepare<T extends AnySQLiteSelect> = EffectSQLitePreparedQuery<
	{
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['result'];
		get: T['_']['result'][number] | undefined;
		values: any[][];
		execute: SQLiteSelectExecute<T>;
	}
>;
