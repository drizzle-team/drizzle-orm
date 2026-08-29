import { entityKind } from '~/entity.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfigWithComment,
	RelationalRowsMapper,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgSession } from '../session.ts';
import type { PgTable } from '../table.ts';

export interface PgRelationalQueryConstructor {
	new(
		schema: TablesRelationalConfig,
		table: PgTable,
		tableConfig: TableRelationalConfig,
		dialect: PgDialect,
		session: PgSession,
		config: DBQueryConfigWithComment<'many' | 'one'> | true,
		mode: 'many' | 'first',
		parseJson: boolean,
	): AnyPgRelationalQuery;
}

export type AnyPgRelationalQuery = PgRelationalQuery<any, any>;

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
	TBuilderHKT extends PgRelationalQueryHKTBase = PgRelationalQueryHKT,
> {
	static readonly [entityKind]: string = 'PgRelationalQueryBuilderV2';

	/** @internal */
	private schema: TSchema;

	/** @internal */
	private table: PgTable;

	/** @internal */
	private tableConfig: TableRelationalConfig;

	/** @internal */
	private dialect: PgDialect;

	/** @internal */
	private session: PgSession;

	/** @internal */
	private parseJson: boolean;

	/** @internal */
	private builder: PgRelationalQueryConstructor;

	constructor(
		schema: TSchema,
		table: PgTable,
		tableConfig: TableRelationalConfig,
		dialect: PgDialect,
		session: PgSession,
		parseJson: boolean,
		builder: PgRelationalQueryConstructor = PgRelationalQuery,
	) {
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.parseJson = parseJson;
		this.builder = builder;
	}

	findMany<TConfig extends DBQueryConfigWithComment<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfigWithComment<'many', TSchema, TFields>>,
	): PgRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfigWithComment<'many'> | undefined ?? true,
			'many',
			this.parseJson,
		);
	}

	findFirst<TConfig extends DBQueryConfigWithComment<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfigWithComment<'one', TSchema, TFields>>,
	): PgRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfigWithComment<'one'> | undefined ?? true,
			'first',
			this.parseJson,
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

	/** @internal */
	protected mapper?: RelationalRowsMapper;

	/** @internal */
	protected shape?: any;

	declare readonly _: {
		readonly dialect: 'pg';
		readonly hkt: THKT;
		readonly result: TResult;
	};

	/** @internal */
	protected schema: TablesRelationalConfig;

	/** @internal */
	protected table: PgTable;

	/** @internal */
	protected tableConfig: TableRelationalConfig;

	/** @internal */
	protected dialect: PgDialect;

	/** @internal */
	protected session: PgSession;

	/** @internal */
	protected config: DBQueryConfigWithComment<'many' | 'one'> | true;

	/** @internal */
	protected mode: 'many' | 'first';

	/** @internal */
	protected parseJson: boolean;

	constructor(
		schema: TablesRelationalConfig,
		table: PgTable,
		tableConfig: TableRelationalConfig,
		dialect: PgDialect,
		session: PgSession,
		config: DBQueryConfigWithComment<'many' | 'one'> | true,
		mode: 'many' | 'first',
		parseJson: boolean,
	) {
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.config = config;
		this.mode = mode;
		this.parseJson = parseJson;
	}

	/** @internal */
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
