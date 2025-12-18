import { entityKind } from '~/entity.ts';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, type Assume, type DrizzleTypeError, type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { PgColumn } from '../columns/index.ts';
import type { PgDialect } from '../dialect.ts';
import { PgSelectQueryBuilderBase } from '../query-builders/select.ts';
import type { PgSelectHKTBase, SelectedFields, TableLikeHasEmptySelection } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgAsyncSelectPrepare, PgAsyncSession } from './session.ts';

export interface PgAsyncSelectQueryBuilderInit<
	TSelection extends SelectedFields | undefined,
> {
	from: PgAsyncSelectQueryBuilderBase<
		undefined,
		TSelection,
		SelectMode
	>['from'];
}

export interface PgAsyncSelectQueryBuilderHKT extends PgSelectHKTBase {
	_type: PgAsyncSelectQueryBuilderBase<
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

export interface PgAsyncSelectQueryBuilderBase<
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
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<ColumnsSelection, TNullabilityMap>,
> extends QueryPromise<TResult> {
	/**
	 * Specify the table, subquery, or other target that you're
	 * building a select query against.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-FROM | Postgres from documentation}
	 */
	from<
		TFrom extends PgTable | Subquery | PgViewBase | SQL,
		TConfig extends Record<string, any> = {
			selectedFields: TSelectedFields;
			tableName: GetSelectTableName<TFrom>;
			selection: TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection;
			selectMode: TSelection extends undefined ? 'single' : 'partial';
			nullabilityMap: GetSelectTableName<TFrom> extends string ? Record<GetSelectTableName<TFrom>, 'not-null'> : {};
		},
	>(
		source: TableLikeHasEmptySelection<TFrom> extends true ? DrizzleTypeError<
				"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
			>
			: TFrom,
	): Omit<
		PgAsyncSelectQueryBuilderBase<
			TConfig['tableName'],
			TConfig['selection'],
			TConfig['selectMode'],
			TConfig['tableName'] extends string ? Record<TConfig['tableName'], 'not-null'> : {},
			false,
			'from',
			SelectResult<TConfig['selection'], TConfig['selectMode'], TConfig['nullabilityMap']>[],
			BuildSubquerySelection<
				Assume<TConfig['selection'], ColumnsSelection>,
				TConfig['nullabilityMap']
			>
		>,
		'from'
	>;
}

export class PgAsyncSelectQueryBuilderBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection | undefined,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<ColumnsSelection, TNullabilityMap>,
> extends PgSelectQueryBuilderBase<
	PgAsyncSelectQueryBuilderHKT,
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

	declare protected session: PgAsyncSession<any, any, any, any> | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: PgAsyncSession<any, any, any, any>;
			dialect: PgDialect;
			withList?: Subquery[];
			distinct?: boolean | {
				on: (PgColumn | SQLWrapper)[];
			};
		},
	) {
		super(config);
	}

	/** @internal */
	_prepare(
		name?: string,
	): PgAsyncSelectPrepare<this> {
		const { session, config, dialect, joinsNotNullableMap, authToken, cacheConfig, usedTables } = this;
		if (!session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}

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

applyMixins(PgAsyncSelectQueryBuilderBase, [QueryPromise]);

export type AnyPgAsyncSelectQueryBuilder = PgAsyncSelectQueryBuilderBase<any, any, any, any, any, any, any, any>;
