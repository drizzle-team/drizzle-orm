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
import type { CockroachDialect } from '../dialect.ts';
import type { CockroachPreparedQuery, CockroachSession, PreparedQueryConfig } from '../session.ts';
import type { CockroachTable } from '../table.ts';

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'CockroachRelationalQueryBuilderV2';

	/** @internal */
	private schema: TSchema;

	/** @internal */
	private table: CockroachTable;

	/** @internal */
	private tableConfig: TableRelationalConfig;

	/** @internal */
	private dialect: CockroachDialect;

	/** @internal */
	private session: CockroachSession;

	constructor(
		schema: TSchema,
		table: CockroachTable,
		tableConfig: TableRelationalConfig,
		dialect: CockroachDialect,
		session: CockroachSession,
	) {
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
	}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): CockroachRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new CockroachRelationalQuery(
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
	): CockroachRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new CockroachRelationalQuery(
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

export class CockroachRelationalQuery<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'cockroach'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachRelationalQueryV2';

	/** @internal */
	protected mapper?: RelationalRowsMapper;

	declare readonly _: {
		readonly dialect: 'cockroach';
		readonly result: TResult;
	};

	/** @internal */
	protected schema: TablesRelationalConfig;

	/** @internal */
	protected table: CockroachTable;

	/** @internal */
	protected tableConfig: TableRelationalConfig;

	/** @internal */
	protected dialect: CockroachDialect;

	/** @internal */
	protected session: CockroachSession;

	/** @internal */
	protected config: DBQueryConfig<'many' | 'one'> | true;

	/** @internal */
	protected mode: 'many' | 'first';

	constructor(
		schema: TablesRelationalConfig,
		table: CockroachTable,
		tableConfig: TableRelationalConfig,
		dialect: CockroachDialect,
		session: CockroachSession,
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
	_prepare(name?: string, generateName = false): CockroachPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { dialect } = this;
			const isFirst = this.mode === 'first';

			const { query, builtQuery } = this._toSQL();

			return this.session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				'arrays',
				name ?? generateName,
				this.mapper ??= dialect.mapperGenerators.relationalRows({
					isFirst,
					parseJson: false,
					parseJsonIfString: false,
					rootJsonMappers: false,
					selection: query.selection,
					arrayModeRoot: true,
				}),
			);
		});
	}

	prepare(name?: string): CockroachPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name, true);
	}

	override execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	}
}
