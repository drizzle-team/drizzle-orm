import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import {
	type BuildQueryResult,
	type BuildRelationalQueryResult,
	type DBQueryConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, QueryWithTypings, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { KnownKeysOnly, NeonAuthToken } from '~/utils.ts';
import type { GelDialect } from '../dialect.ts';
import type { GelPreparedQuery, GelSession, PreparedQueryConfig } from '../session.ts';
import type { GelTable } from '../table.ts';

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'GelRelationalQueryBuilderV2';

	constructor(
		private tables: Record<string, GelTable>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: GelTable,
		private tableConfig: TableRelationalConfig,
		private dialect: GelDialect,
		private session: GelSession,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): PgRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new PgRelationalQuery(
			this.tables,
			this.schema,
			this.tableNamesMap,
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
	): PgRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new PgRelationalQuery(
			this.tables,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
		);
	}
}

export class PgRelationalQuery<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'pg'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'GelRelationalQueryV2';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		private tables: Record<string, GelTable>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: GelTable,
		private tableConfig: TableRelationalConfig,
		private dialect: GelDialect,
		private session: GelSession,
		private config: DBQueryConfig<'many' | 'one'> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	/** @internal */
	_prepare(name?: string): GelPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { query, builtQuery } = this._toSQL();

			return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				undefined,
				name,
				(rawRows, mapColumnValue) => {
					const rows = rawRows.map((row) => mapRelationalRow(row, query.selection, mapColumnValue));
					if (this.mode === 'first') {
						return rows[0] as TResult;
					}
					return rows as TResult;
				},
			);
		});
	}

	prepare(name: string): GelPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
	}

	private _getQuery() {
		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tables: this.tables,
			mode: this.mode,
		});
	}

	/** @internal */
	getSQL(): SQL {
		return this._getQuery().sql;
	}

	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { query, builtQuery };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	override execute(): Promise<TResult> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute();
		});
	}
}
