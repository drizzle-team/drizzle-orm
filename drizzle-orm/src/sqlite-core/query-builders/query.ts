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
import { type Query, type QueryWithTypings, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { PreparedQueryConfig, SQLitePreparedQuery, SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';

export type SQLiteRelationalQueryKind<TMode extends 'sync' | 'async', TResult> = TMode extends 'async'
	? SQLiteRelationalQuery<TMode, TResult>
	: SQLiteSyncRelationalQuery<TResult>;

export class RelationalQueryBuilder<
	TMode extends 'sync' | 'async',
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'SQLiteAsyncRelationalQueryBuilderV2';

	constructor(
		private mode: TMode,
		private schema: TSchema,
		private table: SQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<any, any, any, any, any>,
		private rowMode?: boolean,
		private forbidJsonb?: boolean,
	) {
	}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return this.mode === 'sync'
			? new SQLiteSyncRelationalQuery(
				this.schema,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config as DBQueryConfig<'many'> | undefined ?? true,
				'many',
				this.rowMode,
				this.forbidJsonb,
			) as SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig>[]>
			: new SQLiteRelationalQuery(
				this.schema,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config as DBQueryConfig<'many'> | undefined ?? true,
				'many',
				this.rowMode,
				this.forbidJsonb,
			) as SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig>[]>;
	}

	findFirst<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
	): SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return this.mode === 'sync'
			? new SQLiteSyncRelationalQuery(
				this.schema,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config as DBQueryConfig<'one'> | undefined ?? true,
				'first',
				this.rowMode,
				this.forbidJsonb,
			) as SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig> | undefined>
			: new SQLiteRelationalQuery(
				this.schema,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config as DBQueryConfig<'one'> | undefined ?? true,
				'first',
				this.rowMode,
				this.forbidJsonb,
			) as SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig> | undefined>;
	}
}

export class SQLiteRelationalQuery<TType extends 'sync' | 'async', TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'SQLiteAsyncRelationalQueryV2';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly type: TType;
		readonly result: TResult;
	};

	/** @internal */
	mode: 'many' | 'first';
	/** @internal */
	table: SQLiteTable;

	constructor(
		private schema: TablesRelationalConfig,
		table: SQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<TType, any, any, any, any>,
		private config: DBQueryConfig<'many' | 'one'> | true,
		mode: 'many' | 'first',
		private rowMode?: boolean,
		private forbidJsonb?: boolean,
	) {
		super();
		this.mode = mode;
		this.table = table;
	}

	/** @internal */
	getSQL(): SQL {
		const query = this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
			jsonb: this.forbidJsonb ? sql`json` : sql`jsonb`,
		});

		return query.sql;
	}

	/** @internal */
	_prepare(
		isOneTimeQuery = true,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }> {
		const { query, builtQuery } = this._toSQL();

		return this.session[isOneTimeQuery ? 'prepareOneTimeRelationalQuery' : 'prepareRelationalQuery'](
			builtQuery,
			undefined,
			this.mode === 'first' ? 'get' : 'all',
			(rawRows, mapColumnValue) => {
				const rows = rawRows.map((row) => mapRelationalRow(row, query.selection, mapColumnValue, !this.rowMode));
				if (this.mode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		) as SQLitePreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }>;
	}

	prepare(): SQLitePreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }> {
		return this._prepare(false);
	}

	private _getQuery() {
		const jsonb = this.forbidJsonb ? sql`json` : sql`jsonb`;

		const query = this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
			isNested: this.rowMode,
			jsonb,
		});

		if (this.rowMode) {
			const jsonColumns = sql.join(
				query.selection.map((s) => {
					return sql`${sql.raw(this.dialect.escapeString(s.key))}, ${
						s.selection ? sql`${jsonb}(${sql.identifier(s.key)})` : sql.identifier(s.key)
					}`;
				}),
				sql`, `,
			);

			query.sql = sql`select json_object(${jsonColumns}) as ${sql.identifier('r')} from (${query.sql}) as ${
				sql.identifier('t')
			}`;
		}

		return query;
	}

	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { query, builtQuery };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	/** @internal */
	executeRaw(): TResult {
		if (this.mode === 'first') {
			return this._prepare().get() as TResult;
		}
		return this._prepare().all() as TResult;
	}

	override async execute(): Promise<TResult> {
		return this.executeRaw();
	}
}

export class SQLiteSyncRelationalQuery<TResult> extends SQLiteRelationalQuery<'sync', TResult> {
	static override readonly [entityKind]: string = 'SQLiteSyncRelationalQueryV2';

	sync(): TResult {
		return this.executeRaw();
	}
}
