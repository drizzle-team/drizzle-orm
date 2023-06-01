import { QueryPromise } from '~/query-promise';
import {
	type BuildQueryResult,
	type DBQueryConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { type SQL } from '~/sql';
import { applyMixins, type KnownKeysOnly } from '~/utils';
import { type SQLiteDialect } from '../dialect';
import { type PreparedQuery, type PreparedQueryConfig, type Result, type SQLiteSession } from '../session';
import { type AnySQLiteTable } from '../table';

export class AsyncRelationalQueryBuilder<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: AnySQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<'async', unknown, TFullSchema, TSchema>,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): SQLiteAsyncRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new SQLiteRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? (config as DBQueryConfig<'many', true>) : {},
			'many',
		) as SQLiteAsyncRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]>;
	}

	findFirst<TSelection extends Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): SQLiteAsyncRelationalQuery<BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new SQLiteRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
			'first',
		) as SQLiteAsyncRelationalQuery<BuildQueryResult<TSchema, TFields, TSelection> | undefined>;
	}
}

export class SyncRelationalQueryBuilder<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: AnySQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<'sync', unknown, TFullSchema, TSchema>,
	) {}

	prepareFindMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): {
		execute: PreparedQuery<
			PreparedQueryConfig & {
				type: 'sync';
				all: BuildQueryResult<TSchema, TFields, TConfig>[];
			}
		>['all'];
	} {
		const query = new SQLiteRelationalQuery<'sync', BuildQueryResult<TSchema, TFields, TConfig>[]>(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? (config as DBQueryConfig<'many', true>) : {},
			'many',
		).prepare();

		return {
			execute: query.all.bind(query),
		};
	}

	findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): BuildQueryResult<TSchema, TFields, TConfig>[] {
		return this.prepareFindMany(config).execute();
	}

	prepareFindFirst<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): {
		execute: PreparedQuery<
			PreparedQueryConfig & {
				type: 'sync';
				get: BuildQueryResult<TSchema, TFields, TConfig> | undefined;
			}
		>['get'];
	} {
		const query = new SQLiteRelationalQuery<'sync', BuildQueryResult<TSchema, TFields, TConfig> | undefined>(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
			'first',
		).prepare();

		return {
			execute: query.get.bind(query),
		};
	}

	findFirst<TSelection extends Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): BuildQueryResult<TSchema, TFields, TSelection> | undefined {
		return this.prepareFindFirst(config).execute();
	}
}

export class SQLiteRelationalQuery<TResultKind extends 'sync' | 'async', TResult> {
	declare protected $brand: 'SQLiteRelationalQuery';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: AnySQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<TResultKind, unknown, Record<string, unknown>, TablesRelationalConfig>,
		private config: DBQueryConfig<'many', true> | true,
		private mode: 'many' | 'first',
	) {}

	prepare(): PreparedQuery<PreparedQueryConfig & { type: TResultKind; all: TResult; get: TResult }> {
		const query = this.dialect.buildRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.config,
			this.tableConfig.tsName,
			[],
			true,
		);

		const builtQuery = this.dialect.sqlToQuery(query.sql as SQL);
		return this.session.prepareQuery(
			builtQuery,
			undefined,
			(rawRows, mapColumnValue) => {
				const rows = rawRows.map((row) =>
					mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
				);
				if (this.mode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		);
	}

	execute(): Result<TResultKind, TResult> {
		if (this.mode === 'first') {
			return this.prepare().get();
		}
		return this.prepare().all();
	}
}

export interface SQLiteAsyncRelationalQuery<TResult>
	extends SQLiteRelationalQuery<'async', TResult>, QueryPromise<TResult>
{}

applyMixins(SQLiteRelationalQuery, [QueryPromise]);
