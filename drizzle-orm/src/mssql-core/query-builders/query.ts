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

	/** @internal */
	private schema: TSchema;

	/** @internal */
	private table: MsSqlTable;

	/** @internal */
	private tableConfig: TableRelationalConfig;

	/** @internal */
	private dialect: MsSqlDialect;

	/** @internal */
	private session: MsSqlSession;

	constructor(
		schema: TSchema,
		table: MsSqlTable,
		tableConfig: TableRelationalConfig,
		dialect: MsSqlDialect,
		session: MsSqlSession,
	) {
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
	}

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

	/** @internal */
	declare protected $brand: 'MsSqlRelationalQuery';

	/** @internal */
	protected schema: TablesRelationalConfig;

	/** @internal */
	protected table: MsSqlTable;

	/** @internal */
	protected tableConfig: TableRelationalConfig;

	/** @internal */
	protected dialect: MsSqlDialect;

	/** @internal */
	protected session: MsSqlSession;

	/** @internal */
	protected config: DBQueryConfig<'many' | 'one'> | true;

	/** @internal */
	protected mode: 'many' | 'first';

	constructor(
		schema: TablesRelationalConfig,
		table: MsSqlTable,
		tableConfig: TableRelationalConfig,
		dialect: MsSqlDialect,
		session: MsSqlSession,
		config: DBQueryConfig<'many' | 'one'> | true,
		mode: 'many' | 'first',
	) {
		super();
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.config = config;
		this.mode = mode;
	}

	/** @internal */
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

	/** @internal */
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
