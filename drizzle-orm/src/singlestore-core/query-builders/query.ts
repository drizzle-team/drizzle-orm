import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfig,
	RelationalRowsMapper,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { SingleStoreDialect } from '../dialect.ts';
import type {
	PreparedQueryHKTBase,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStoreSession,
} from '../session.ts';
import type { SingleStoreTable } from '../table.ts';
import type { SingleStoreView } from '../view.ts';

export class RelationalQueryBuilder<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'SingleStoreRelationalQueryBuilderV2';

	/** @internal */
	private schema: TSchema;

	/** @internal */
	private table: SingleStoreTable | SingleStoreView;

	/** @internal */
	private tableConfig: TableRelationalConfig;

	/** @internal */
	private dialect: SingleStoreDialect;

	/** @internal */
	private session: SingleStoreSession;

	constructor(
		schema: TSchema,
		table: SingleStoreTable | SingleStoreView,
		tableConfig: TableRelationalConfig,
		dialect: SingleStoreDialect,
		session: SingleStoreSession,
	) {
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
	}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): SingleStoreRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new SingleStoreRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'many'> | undefined ?? true,
			'many',
		);
	}

	findFirst<TSelection extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TSelection, DBQueryConfig<'one', TSchema, TFields>>,
	): SingleStoreRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new SingleStoreRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
		);
	}
}

export class SingleStoreRelationalQuery<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TResult,
> extends QueryPromise<TResult> {
	static override readonly [entityKind]: string = 'SingleStoreRelationalQueryV2';

	/** @internal */
	protected mapper?: RelationalRowsMapper;

	/** @internal */
	declare protected $brand: 'SingleStoreRelationalQuery';

	/** @internal */
	private schema: TablesRelationalConfig;

	/** @internal */
	private table: SingleStoreTable | SingleStoreView;

	/** @internal */
	private tableConfig: TableRelationalConfig;

	/** @internal */
	private dialect: SingleStoreDialect;

	/** @internal */
	private session: SingleStoreSession;

	/** @internal */
	private config: DBQueryConfig<'many' | 'one'> | true;

	/** @internal */
	private mode: 'many' | 'first';

	constructor(
		schema: TablesRelationalConfig,
		table: SingleStoreTable | SingleStoreView,
		tableConfig: TableRelationalConfig,
		dialect: SingleStoreDialect,
		session: SingleStoreSession,
		config: DBQueryConfig<'many' | 'one'> | true,
		mode: 'many' | 'first',
	) {
		super();
		this.schema = schema;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.config = config;
		this.mode = mode;
	}

	prepare() {
		const { query, builtQuery } = this._toSQL();
		return this.session.prepareQuery(
			builtQuery,
			'objects',
			this.mapper ??= this.dialect.mapperGenerators.relationalRows({
				isFirst: this.mode === 'first',
				parseJson: false,
				parseJsonIfString: true,
				rootJsonMappers: false,
				selection: query.selection,
			}),
		) as PreparedQueryKind<TPreparedQueryHKT, SingleStorePreparedQueryConfig & { execute: TResult }, true>;
	}

	/** @internal */
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
	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { builtQuery, query };
	}

	getSQL(): SQL {
		return this._getQuery().sql;
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	override execute(): Promise<TResult> {
		return this.prepare().execute();
	}
}
