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

	constructor(
		private schema: TSchema,
		private table: CockroachTable,
		private tableConfig: TableRelationalConfig,
		private dialect: CockroachDialect,
		private session: CockroachSession,
	) {}

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

	constructor(
		protected schema: TablesRelationalConfig,
		protected table: CockroachTable,
		protected tableConfig: TableRelationalConfig,
		protected dialect: CockroachDialect,
		protected session: CockroachSession,
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
