import { entityKind } from '~/entity.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfig,
	RelationalRowsMapper,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import { type Query, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';

export interface SQLiteRelationalQueryHKTBase {
	type: unknown;
	result: unknown;
	_type: unknown;
}

export interface SQLiteRelationalQueryHKT extends SQLiteRelationalQueryHKTBase {
	_type: SQLiteRelationalQuery<SQLiteRelationalQueryHKT, this['result']>;
}

export type SQLiteRelationalQueryKind<
	T extends SQLiteRelationalQueryHKTBase,
	TType,
	TResult,
> = (T & {
	type: TType;
	result: TResult;
})['_type'];

export interface SQLiteRelationalQueryConstructor {
	new(
		mode: unknown,
		schema: TablesRelationalConfig,
		table: SQLiteTable,
		tableConfig: TableRelationalConfig,
		dialect: SQLiteDialect,
		session: SQLiteSession<any, any>,
		config: DBQueryConfig<'many' | 'one'> | true,
		queryMode: 'many' | 'first',
		forbidJsonb: boolean | undefined,
	): AnySQLiteRelationalQuery;
}

export type AnySQLiteRelationalQuery = SQLiteRelationalQuery<any, any>;

export class RelationalQueryBuilder<
	TMode,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
	TBuilderHKT extends SQLiteRelationalQueryHKTBase = SQLiteRelationalQueryHKT,
> {
	static readonly [entityKind]: string = 'SQLiteRelationalQueryBuilderV2';

	/** @internal */
	private mode: TMode;

	/** @internal */
	private schema: TSchema;

	/** @internal */
	private table: SQLiteTable;

	/** @internal */
	private tableConfig: TableRelationalConfig;

	/** @internal */
	private dialect: SQLiteDialect;

	/** @internal */
	private session: SQLiteSession<any, any>;

	/** @internal */
	private forbidJsonb: boolean | undefined;

	/** @internal */
	private builder: SQLiteRelationalQueryConstructor;

	constructor(
		mode: TMode,
		schema: TSchema,
		table: SQLiteTable,
		tableConfig: TableRelationalConfig,
		dialect: SQLiteDialect,
		session: SQLiteSession<any, any>,
		forbidJsonb: boolean | undefined,
		builder: SQLiteRelationalQueryConstructor = SQLiteRelationalQuery,
	) {
		this.mode = mode;
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.forbidJsonb = forbidJsonb;
		this.builder = builder;
	}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): SQLiteRelationalQueryKind<TBuilderHKT, TMode, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.mode,
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'many'> | undefined ?? true,
			'many',
			this.forbidJsonb,
		) as any;
	}

	findFirst<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
	): SQLiteRelationalQueryKind<TBuilderHKT, TMode, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new this.builder(
			this.mode,
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
			this.forbidJsonb,
		) as any;
	}
}

export class SQLiteRelationalQuery<THKT extends SQLiteRelationalQueryHKTBase, TResult> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteRelationalQueryV2';

	/** @internal */
	protected mapper?: RelationalRowsMapper;

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly hkt: THKT;
		readonly result: TResult;
	};

	/** @internal */
	mode: 'many' | 'first';
	/** @internal */
	table: SQLiteTable;
	/** @internal */
	resultKind: unknown;

	/** @internal */
	protected schema: TablesRelationalConfig;

	/** @internal */
	protected tableConfig: TableRelationalConfig;

	/** @internal */
	protected dialect: SQLiteDialect;

	/** @internal */
	protected session: SQLiteSession<any, any>;

	/** @internal */
	protected config: DBQueryConfig<'many' | 'one'> | true;

	/** @internal */
	protected forbidJsonb?: boolean;

	constructor(
		resultKind: unknown,
		schema: TablesRelationalConfig,
		table: SQLiteTable,
		tableConfig: TableRelationalConfig,
		dialect: SQLiteDialect,
		session: SQLiteSession<any, any>,
		config: DBQueryConfig<'many' | 'one'> | true,
		mode: 'many' | 'first',
		forbidJsonb?: boolean,
	) {
		this.schema = schema;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.config = config;
		this.forbidJsonb = forbidJsonb;
		this.resultKind = resultKind;
		this.mode = mode;
		this.table = table;
	}

	getSQL(): SQL {
		return this._getQuery().sql;
	}

	/** @internal */
	protected _getQuery() {
		const jsonb = this.forbidJsonb ? sql`json` : sql`jsonb`;

		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
			jsonb,
		});
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
}
