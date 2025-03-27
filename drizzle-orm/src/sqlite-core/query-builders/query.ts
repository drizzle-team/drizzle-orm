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
import type { KnownKeysOnly } from '~/utils.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { PreparedQueryConfig, SQLitePreparedQuery, SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';

export type SQLiteRelationalQueryKind<TMode extends 'sync' | 'async', TResult> = TMode extends 'async'
	? SQLiteRelationalQuery<TMode, TResult>
	: SQLiteSyncRelationalQuery<TResult>;

export class RelationalQueryBuilder<
	TMode extends 'sync' | 'async',
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'SQLiteAsyncRelationalQueryBuilder';

	constructor(
		protected mode: TMode,
		protected fullSchema: Record<string, unknown>,
		protected schema: TSchema,
		protected tableNamesMap: Record<string, string>,
		protected table: SQLiteTable,
		protected tableConfig: TableRelationalConfig,
		protected dialect: SQLiteDialect,
		protected session: SQLiteSession<'async', unknown, TFullSchema, TSchema>,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return (this.mode === 'sync'
			? new SQLiteSyncRelationalQuery(
				this.fullSchema,
				this.schema,
				this.tableNamesMap,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config ? (config as DBQueryConfig<'many', true>) : {},
				'many',
			)
			: new SQLiteRelationalQuery(
				this.fullSchema,
				this.schema,
				this.tableNamesMap,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config ? (config as DBQueryConfig<'many', true>) : {},
				'many',
			)) as SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TConfig>[]>;
	}

	findFirst<TSelection extends Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return (this.mode === 'sync'
			? new SQLiteSyncRelationalQuery(
				this.fullSchema,
				this.schema,
				this.tableNamesMap,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
				'first',
			)
			: new SQLiteRelationalQuery(
				this.fullSchema,
				this.schema,
				this.tableNamesMap,
				this.table,
				this.tableConfig,
				this.dialect,
				this.session,
				config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
				'first',
			)) as SQLiteRelationalQueryKind<TMode, BuildQueryResult<TSchema, TFields, TSelection> | undefined>;
	}
}

export class SQLiteRelationalQuery<TType extends 'sync' | 'async', TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'SQLiteAsyncRelationalQuery';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly type: TType;
		readonly result: TResult;
	};

	/** @internal */
	mode: 'many' | 'first';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		/** @internal */
		public table: SQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<'sync' | 'async', unknown, Record<string, unknown>, TablesRelationalConfig>,
		private config: DBQueryConfig<'many', true> | true,
		mode: 'many' | 'first',
	) {
		super();
		this.mode = mode;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildRelationalQuery({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName,
		}).sql as SQL;
	}

	/** @internal */
	_prepare(
		isOneTimeQuery = false,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }> {
		const { query, builtQuery } = this._toSQL();

		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			builtQuery,
			undefined,
			this.mode === 'first' ? 'get' : 'all',
			true,
			(rawRows, mapColumnValue) => {
				const rows = rawRows.map((row) =>
					mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
				);
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

	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
		const query = this.dialect.buildRelationalQuery({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName,
		});

		const builtQuery = this.dialect.sqlToQuery(query.sql as SQL);

		return { query, builtQuery };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	/** @internal */
	executeRaw(): TResult {
		if (this.mode === 'first') {
			return this._prepare(false).get() as TResult;
		}
		return this._prepare(false).all() as TResult;
	}

	override async execute(): Promise<TResult> {
		return this.executeRaw();
	}
}

export class SQLiteSyncRelationalQuery<TResult> extends SQLiteRelationalQuery<'sync', TResult> {
	static override readonly [entityKind]: string = 'SQLiteSyncRelationalQuery';

	sync(): TResult {
		return this.executeRaw();
	}
}
