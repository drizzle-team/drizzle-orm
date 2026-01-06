import { entityKind } from '~/entity.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, type Assume, type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { PgColumn } from '../columns/index.ts';
import { PgSelectBase, type PgSelectBuilder } from '../query-builders/select.ts';
import type { PgSelectHKTBase, SelectedFields } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

export type PgAsyncSelectPrepare<T extends AnyPgAsyncSelect> = PgAsyncPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type PgAsyncSelectBuilder<
	TSelection extends SelectedFields | undefined,
> = PgSelectBuilder<TSelection, PgAsyncSelectHKT>;

export type PgAsyncSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = PgAsyncSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never
>;

export interface PgAsyncSelectHKT extends PgSelectHKTBase {
	_type: PgAsyncSelectBase<
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

export interface PgAsyncSelectBase<
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
> extends QueryPromise<TResult> {
}

export class PgAsyncSelectBase<
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
	PgAsyncSelectHKT,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'PgAsyncSelectQueryBuilder';

	declare protected session: PgAsyncSession;

	/** @internal */
	_prepare(
		name?: string,
	): PgAsyncSelectPrepare<this> {
		const { session, config, dialect, joinsNotNullableMap, authToken, cacheConfig, usedTables } = this;
		const { fields } = config;

		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const fieldsList = orderSelectedFields<PgColumn>(fields);
			const query = session.prepareQuery<
				PreparedQueryConfig & { execute: any }
			>(dialect.sqlToQuery(this.getSQL()), fieldsList, name, true, undefined, {
				type: 'select',
				tables: [...usedTables],
			}, cacheConfig);
			query.joinsNotNullableMap = joinsNotNullableMap;

			return query.setToken(authToken);
		}) as any;
	}

	/**
	 * Create a prepared statement for this query. This allows
	 * the database to remember this query for the given session
	 * and call it by name, rather than specifying the full query.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
	 */
	prepare(
		name: string,
	): PgAsyncSelectPrepare<this> {
		return this._prepare(name);
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	}
}

applyMixins(PgAsyncSelectBase, [QueryPromise]);

export type AnyPgAsyncSelect = PgAsyncSelectBase<any, any, any, any, any, any, any, any>;
