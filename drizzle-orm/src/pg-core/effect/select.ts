import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { type Assume, orderSelectedFields } from '~/utils.ts';
import type { PgColumn } from '../columns/index.ts';
import { PgSelectBase, type PgSelectBuilder } from '../query-builders/select.ts';
import type { PgSelectHKTBase, SelectedFields } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export type PgEffectSelectPrepare<T extends AnyPgEffectSelect> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type PgEffectSelectBuilder<
	TSelection extends SelectedFields | undefined,
> = PgSelectBuilder<TSelection, PgEffectSelectHKT>;

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

export interface PgEffectSelectHKT extends PgSelectHKTBase {
	_type: PgEffectSelectBase<
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
	// oxlint-disable-next-line no-unused-vars
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	// oxlint-disable-next-line no-unused-vars
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
		Assume<TSelection, ColumnsSelection>,
		TNullabilityMap
	>,
> extends QueryEffect<TResult> {
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
> extends PgSelectBase<
	PgEffectSelectHKT,
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

	declare protected session: PgEffectSession;

	/** @internal */
	_prepare(name?: string): PgEffectSelectPrepare<this> {
		const { session, config, dialect, joinsNotNullableMap, cacheConfig, usedTables } = this;
		const { fields } = config;

		const fieldsList = orderSelectedFields<PgColumn>(fields);
		const query = session.prepareQuery<
			PreparedQueryConfig & { execute: TResult }
		>(dialect.sqlToQuery(this.getSQL()), fieldsList, name, true, undefined, {
			type: 'select',
			tables: [...usedTables],
		}, cacheConfig);
		query.joinsNotNullableMap = joinsNotNullableMap;

		return query;
	}

	/**
	 * Create a prepared statement for this query. This allows
	 * the database to remember this query for the given session
	 * and call it by name, rather than specifying the full query.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
	 */
	prepare(name: string): PgEffectSelectPrepare<this> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(PgEffectSelectBase);

export type AnyPgEffectSelect = PgEffectSelectBase<any, any, any, any, any, any, any, any>;
