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
import type { PgAsyncPreparedQuery, PgAsyncSession } from '../async/session.ts';
import type { PgDialect } from '../dialect.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgTable } from '../table.ts';

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'PgRelationalQueryBuilderV2';

	constructor(
		private schema: TSchema,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgAsyncSession,
		private parseJson: boolean,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): PgRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new PgRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'many'> | undefined ?? true,
			'many',
			this.parseJson,
		);
	}

	findFirst<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
	): PgRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new PgRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
			this.parseJson,
		);
	}
}

export class PgRelationalQuery<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'pg'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'PgRelationalQueryV2';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		private schema: TablesRelationalConfig,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgAsyncSession,
		private config: DBQueryConfig<'many' | 'one'> | true,
		private mode: 'many' | 'first',
		private parseJson: boolean,
	) {
		super();
	}

	/** @internal */
	_prepare(name?: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { query, builtQuery } = this._toSQL();

			return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				undefined,
				name,
				(rawRows, mapColumnValue) => {
					const rows = rawRows.map((row) => mapRelationalRow(row, query.selection, mapColumnValue, this.parseJson));
					if (this.mode === 'first') {
						return rows[0] as TResult;
					}
					return rows as TResult;
				},
			);
		});
	}

	prepare(name: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
	}

	private _getQuery() {
		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
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
			// @ts-ignore - TODO
			return this._prepare().execute(undefined, this.authToken);
		});
	}
}
