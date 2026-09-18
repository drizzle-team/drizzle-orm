import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfig,
	RelationalRowsMapper,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { MsSqlDialect } from '../dialect.ts';
import type { MsSqlSession, PreparedQueryConfig, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
import type { MsSqlTable } from '../table.ts';

export class RelationalQueryBuilder<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'MsSqlRelationalQueryBuilderV2';

	constructor(
		private schema: TSchema,
		private table: MsSqlTable,
		private tableConfig: TableRelationalConfig,
		private dialect: MsSqlDialect,
		private session: MsSqlSession,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): MsSqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new MsSqlRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'many'> | undefined ?? true,
			'many',
		);
	}

	findFirst<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
	): MsSqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new MsSqlRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
		);
	}
}

export class MsSqlRelationalQuery<TPreparedQueryHKT extends PreparedQueryHKTBase, TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'mssql'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'MsSqlRelationalQueryV2';

	/** @internal */
	protected mapper?: RelationalRowsMapper;

	declare readonly _: {
		readonly dialect: 'mssql';
		readonly result: TResult;
	};

	declare protected $brand: 'MsSqlRelationalQuery';

	constructor(
		protected schema: TablesRelationalConfig,
		protected table: MsSqlTable,
		protected tableConfig: TableRelationalConfig,
		protected dialect: MsSqlDialect,
		protected session: MsSqlSession,
		protected config: DBQueryConfig<'many' | 'one'> | true,
		protected mode: 'many' | 'first',
	) {
		super();
	}

	protected _getQuery() {
		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
		});
	}

	getSQL(): SQL {
		return this._getQuery().sql;
	}

	protected _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { query, builtQuery };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	/** @internal */
	_prepare(): PreparedQueryKind<TPreparedQueryHKT, PreparedQueryConfig & { execute: TResult }, true> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { dialect } = this;
			const isFirst = this.mode === 'first';

			const { query, builtQuery } = this._toSQL();

			return this.session.prepareQuery(
				builtQuery,
				'arrays',
				this.mapper ??= dialect.mapperGenerators.relationalRows({
					isFirst,
					// JSON path query returns JSON as string
					parseJson: true,
					parseJsonIfString: false,
					rootJsonMappers: false,
					selection: query.selection,
					arrayModeRoot: true,
				}),
			) as PreparedQueryKind<TPreparedQueryHKT, PreparedQueryConfig & { execute: TResult }, true>;
		});
	}

	prepare(): PreparedQueryKind<TPreparedQueryHKT, PreparedQueryConfig & { execute: TResult }, true> {
		return this._prepare();
	}

	override execute(): Promise<TResult> {
		return this._prepare().execute();
	}
}
