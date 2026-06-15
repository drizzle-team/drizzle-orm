import { entityKind } from '~/entity.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfigWithComment,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlSession } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlView } from '../view.ts';

export interface MySqlRelationalQueryConstructor {
	new(
		schema: TablesRelationalConfig,
		table: MySqlTable | MySqlView,
		tableConfig: TableRelationalConfig,
		dialect: MySqlDialect,
		session: MySqlSession,
		config: DBQueryConfigWithComment<'many' | 'one'> | true,
		mode: 'many' | 'first',
	): AnyMySqlRelationalQuery;
}

export type AnyMySqlRelationalQuery = MySqlRelationalQuery<any, any>;

export class RelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
	TBuilderHKT extends MySqlRelationalQueryHKTBase = MySqlRelationalQueryHKT,
> {
	static readonly [entityKind]: string = 'MySqlRelationalQueryBuilderV2';

	constructor(
		private schema: TSchema,
		private table: MySqlTable | MySqlView,
		private tableConfig: TableRelationalConfig,
		private dialect: MySqlDialect,
		private session: MySqlSession,
		private builder: MySqlRelationalQueryConstructor = MySqlRelationalQuery,
	) {}

	findMany<TConfig extends DBQueryConfigWithComment<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfigWithComment<'many', TSchema, TFields>>,
	): MySqlRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
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
		config?: KnownKeysOnly<TSelection, DBQueryConfigWithComment<'one', TSchema, TFields>>,
	): MySqlRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new this.builder(
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

export interface MySqlRelationalQueryHKTBase {
	result: unknown;
	_type: unknown;
}

export interface MySqlRelationalQueryHKT extends MySqlRelationalQueryHKTBase {
	_type: MySqlRelationalQuery<MySqlRelationalQueryHKT, this['result']>;
}

export type MySqlRelationalQueryKind<
	T extends MySqlRelationalQueryHKTBase,
	TResult,
> = (T & {
	result: TResult;
})['_type'];

export class MySqlRelationalQuery<THKT extends MySqlRelationalQueryHKTBase, TResult> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlRelationalQueryV2';

	declare readonly _: {
		readonly hkt: THKT;
		readonly result: TResult;
	};

	declare protected $brand: 'MySqlRelationalQuery';

	constructor(
		protected schema: TablesRelationalConfig,
		protected table: MySqlTable | MySqlView,
		protected tableConfig: TableRelationalConfig,
		protected dialect: MySqlDialect,
		protected session: MySqlSession,
		protected config: DBQueryConfigWithComment<'many' | 'one'> | true,
		protected mode: 'many' | 'first',
	) {}

	protected _getQuery() {
		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
		});
	}

	protected _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query } {
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
}
