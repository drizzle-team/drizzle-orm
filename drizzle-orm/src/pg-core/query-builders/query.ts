import { entityKind } from '~/entity.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfig,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import { defaultRowMapper, type RowMapperGenerator } from '~/row-mappers/index.ts';
import type { Query, QueryWithTypings, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgBasePreparedQuery, PgSession, PreparedQueryConfig } from '../session.ts';
import type { PgTable } from '../table.ts';

export interface PgRelationalQueryConstructor {
	new(
		schema: TablesRelationalConfig,
		table: PgTable,
		tableConfig: TableRelationalConfig,
		dialect: PgDialect,
		session: PgSession,
		config: DBQueryConfig<'many' | 'one'> | true,
		mode: 'many' | 'first',
		parseJson: boolean,
		rowMapperGenerator?: RowMapperGenerator,
	): AnyPgRelationalQuery;
}

export type AnyPgRelationalQuery = PgRelationalQuery<any, any>;

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
	TBuilderHKT extends PgRelationalQueryHKTBase = PgRelationalQueryHKT,
> {
	static readonly [entityKind]: string = 'PgRelationalQueryBuilderV2';

	constructor(
		private schema: TSchema,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
		private parseJson: boolean,
		private builder: PgRelationalQueryConstructor = PgRelationalQuery,
		private rowMapperGenerator: RowMapperGenerator = defaultRowMapper,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): PgRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'many'> | undefined ?? true,
			'many',
			this.parseJson,
			this.rowMapperGenerator,
		);
	}

	findFirst<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
	): PgRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
			this.parseJson,
			this.rowMapperGenerator,
		);
	}
}

export interface PgRelationalQueryHKTBase {
	result: unknown;
	_type: unknown;
}

export interface PgRelationalQueryHKT extends PgRelationalQueryHKTBase {
	_type: PgRelationalQuery<PgRelationalQueryHKT, this['result']>;
}

export type PgRelationalQueryKind<
	T extends PgRelationalQueryHKTBase,
	TResult,
> = (T & {
	result: TResult;
})['_type'];

export class PgRelationalQuery<THKT extends PgRelationalQueryHKTBase, TResult> implements SQLWrapper {
	static readonly [entityKind]: string = 'PgRelationalQueryV2';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly hkt: THKT;
		readonly result: TResult;
	};

	constructor(
		protected schema: TablesRelationalConfig,
		protected table: PgTable,
		protected tableConfig: TableRelationalConfig,
		protected dialect: PgDialect,
		protected session: PgSession,
		protected config: DBQueryConfig<'many' | 'one'> | true,
		protected mode: 'many' | 'first',
		protected parseJson: boolean,
		protected rowMapperGenerator: RowMapperGenerator = defaultRowMapper,
	) {}

	/** @internal */
	_prepare(name?: string): PgBasePreparedQuery {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { builtQuery, query } = this._toSQL();

			const mapperResult = this.rowMapperGenerator(query.selection, this.parseJson);
			const mapRows = mapperResult.mapper;
			const isArrayMode = mapperResult.isArrayMode;
			const mode = this.mode;

			return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				undefined,
				name,
				(rawRows: unknown[][] | Record<string, unknown>[]) => {
					const rows = mapRows(rawRows as any) as TResult[];
					if (mode === 'first') {
						return rows[0] as TResult;
					}
					return rows as TResult;
				},
				isArrayMode,
			);
		});
	}

	prepare(name: string): PgBasePreparedQuery {
		return this._prepare(name);
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

	/** @internal */
	getSQL(): SQL {
		return this._getQuery().sql;
	}

	protected _toSQL(): { query: BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { query, builtQuery };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}
}
