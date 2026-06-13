import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfigWithComment,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL, SqlCommenterInput } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { MsSqlDialect } from '../dialect.ts';
import type { MsSqlSession, PreparedQueryConfig, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
import type { MsSqlTable } from '../table.ts';
import type { MsSqlView } from '../view.ts';

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'MsSqlRelationalQueryBuilderV2';

	constructor(
		private schema: TSchema,
		private table: MsSqlTable | MsSqlView,
		private tableConfig: TableRelationalConfig,
		private dialect: MsSqlDialect,
		private session: MsSqlSession,
	) {}

	findMany<TConfig extends DBQueryConfigWithComment<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfigWithComment<'many', TSchema, TFields>> & {
			comment?: SqlCommenterInput;
		},
	): MsSqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new MsSqlRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfigWithComment<'many'> | undefined ?? true,
			'many',
		);
	}

	findFirst<TConfig extends DBQueryConfigWithComment<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfigWithComment<'one', TSchema, TFields>> & {
			comment?: SqlCommenterInput;
		},
	): MsSqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new MsSqlRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfigWithComment<'one'> | undefined ?? true,
			'first',
		);
	}
}

export class MsSqlRelationalQuery<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TResult,
> extends QueryPromise<TResult> {
	static override readonly [entityKind]: string = 'MsSqlRelationalQueryV2';

	declare protected $brand: 'MsSqlRelationalQueryV2';

	constructor(
		private schema: TablesRelationalConfig,
		private table: MsSqlTable | MsSqlView,
		private tableConfig: TableRelationalConfig,
		private dialect: MsSqlDialect,
		private session: MsSqlSession,
		private config: DBQueryConfigWithComment<'many' | 'one'> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	prepare() {
		const { query, builtQuery } = this._toSQL();
		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: true,
			selection: query.selection,
		});

		return this.session.prepareQuery(
			builtQuery,
			undefined,
			(rawRows) => {
				const json = rawRows.map((row) => row[0] ?? '').join('');
				const rows = json ? JSON.parse(json as string) as Record<string, unknown>[] : [];
				return mapper(rows) as TResult;
			},
		) as PreparedQueryKind<TPreparedQueryHKT, PreparedQueryConfig & { execute: TResult }, true>;
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

	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query } {
		const query = this._getQuery();
		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { builtQuery, query };
	}

	/** @internal */
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
