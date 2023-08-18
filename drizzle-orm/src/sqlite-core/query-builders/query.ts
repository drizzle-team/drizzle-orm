import { entityKind } from '~/entity';
import { QueryPromise } from '~/query-promise';
import {
	type BuildQueryResult,
	type DBQueryConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { type SQL } from '~/sql';
import { type KnownKeysOnly } from '~/utils';
import { type SQLiteDialect } from '../dialect';
import { type PreparedQuery, type PreparedQueryConfig, type SQLiteSession } from '../session';
import { type SQLiteTable } from '../table';

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

export class SQLiteRelationalQuery<TType extends 'sync' | 'async', TResult> extends QueryPromise<TResult> {
	static readonly [entityKind]: string = 'SQLiteAsyncRelationalQuery';

	declare protected $brand: 'SQLiteRelationalQuery';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: SQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<'sync' | 'async', unknown, Record<string, unknown>, TablesRelationalConfig>,
		private config: DBQueryConfig<'many', true> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	prepare(): PreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }> {
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
		return this.session.prepareQuery(
			builtQuery,
			undefined,
			this.mode === 'first' ? 'get' : 'all',
			(rawRows, mapColumnValue) => {
				const rows = rawRows.map((row) =>
					mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
				);
				if (this.mode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		) as PreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }>;
	}

	/** @internal */
	executeRaw(): TResult {
		if (this.mode === 'first') {
			return this.prepare().get() as TResult;
		}
		return this.prepare().all() as TResult;
	}

	override async execute(): Promise<TResult> {
		return this.executeRaw();
	}
}

export class SQLiteSyncRelationalQuery<TResult> extends SQLiteRelationalQuery<'sync', TResult> {
	static readonly [entityKind]: string = 'SQLiteSyncRelationalQuery';

	sync(): TResult {
		return this.executeRaw();
	}
}
