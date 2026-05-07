import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import {
	type BuildQueryResult,
	type BuildRelationalQueryResult,
	type DBQueryConfigWithComment,
	makeDefaultRqbMapper,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL, SqlCommenterInput } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlPreparedQueryConfig, MySqlSession, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlView } from '../view.ts';

export class RelationalQueryBuilder<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'MySqlRelationalQueryBuilderV2';

	constructor(
		private schema: TSchema,
		private table: MySqlTable | MySqlView,
		private tableConfig: TableRelationalConfig,
		private dialect: MySqlDialect,
		private session: MySqlSession,
	) {}

	findMany<TConfig extends DBQueryConfigWithComment<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfigWithComment<'many', TSchema, TFields>> & {
			comment?: SqlCommenterInput;
		},
	): MySqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new MySqlRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfigWithComment<'many'> | undefined ?? true,
			'many',
		);
	}

	findFirst<TSelection extends DBQueryConfigWithComment<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TSelection, DBQueryConfigWithComment<'one', TSchema, TFields>> & {
			comment?: SqlCommenterInput;
		},
	): MySqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new MySqlRelationalQuery(
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

export class MySqlRelationalQuery<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TResult,
> extends QueryPromise<TResult> {
	static override readonly [entityKind]: string = 'MySqlRelationalQueryV2';

	declare protected $brand: 'MySqlRelationalQuery';

	constructor(
		private schema: TablesRelationalConfig,
		private table: MySqlTable | MySqlView,
		private tableConfig: TableRelationalConfig,
		private dialect: MySqlDialect,
		private session: MySqlSession,
		private config: DBQueryConfigWithComment<'many' | 'one'> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	prepare() {
		const { query, builtQuery } = this._toSQL();
		return this.session.prepareRelationalQuery(
			builtQuery,
			undefined,
			makeDefaultRqbMapper({
				isFirst: this.mode === 'first',
				parseJson: false,
				parseJsonIfString: false,
				rootJsonMappers: true,
				selection: query.selection,
			}),
			{
				isFirst: this.mode === 'first',
				parseJson: false,
				parseJsonIfString: false,
				rootJsonMappers: true,
				selection: query.selection,
			},
		) as PreparedQueryKind<TPreparedQueryHKT, MySqlPreparedQueryConfig & { execute: TResult }, true>;
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
