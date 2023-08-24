import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import {
	type BuildQueryResult,
	type DBQueryConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { SQL } from '~/sql/index.ts';
// Was removed due to errors in types. We will rewrite this logic to make it available explicitly
// import { tracer } from '~/tracing.ts';
import { type KnownKeysOnly } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgSession, PreparedQuery, PreparedQueryConfig } from '../session.ts';
import { type PgTable } from '../table.ts';

export class RelationalQueryBuilder<TSchema extends TablesRelationalConfig, TFields extends TableRelationalConfig> {
	static readonly [entityKind]: string = 'PgRelationalQueryBuilder';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): PgRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new PgRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? (config as DBQueryConfig<'many', true>) : {},
			'many',
		);
	}

	findFirst<TSelection extends Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): PgRelationalQuery<BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new PgRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
			'first',
		);
	}
}

export class PgRelationalQuery<TResult> extends QueryPromise<TResult> {
	static readonly [entityKind]: string = 'PgRelationalQuery';

	declare protected $brand: 'PgRelationalQuery';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
		private config: DBQueryConfig<'many', true> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	// Was commented due to errors in types. We will rewrite this logic to make it available explicitly
	// Left the code to save a references for future implementations
	private _prepare(name?: string): PreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		// return tracer.startActiveSpan('drizzle.prepareQuery', () => {
		// const query = this.tableConfig.primaryKey.length > 0
		// 	? this.dialect.buildRelationalQueryWithPK({
		// 		fullSchema: this.fullSchema,
		// 		schema: this.schema,
		// 		tableNamesMap: this.tableNamesMap,
		// 		table: this.table,
		// 		tableConfig: this.tableConfig,
		// 		queryConfig: this.config,
		// 		tableAlias: this.tableConfig.tsName,
		// 		isRoot: true,
		// 	})
		// 	: this.dialect.buildRelationalQueryWithoutPK({
		// 		fullSchema: this.fullSchema,
		// 		schema: this.schema,
		// 		tableNamesMap: this.tableNamesMap,
		// 		table: this.table,
		// 		tableConfig: this.tableConfig,
		// 		queryConfig: this.config,
		// 		tableAlias: this.tableConfig.tsName,
		// 	});

		const query = this.dialect.buildRelationalQueryWithoutPK({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName,
		});

		const builtQuery = this.dialect.sqlToQuery(query.sql as SQL);
		return this.session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
			builtQuery,
			undefined,
			name,
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
		// });
	}

	prepare(name: string): PreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
	}

	// Was commented due to errors in types. We will rewrite this logic to make it available explicitly
	// Left the code to save a references for future implementations
	override execute(): Promise<TResult> {
		// return tracer.startActiveSpan('drizzle.operation', () => {
		return this._prepare().execute();
		// });
	}
}
