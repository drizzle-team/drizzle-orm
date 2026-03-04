import { entityKind } from '~/entity.ts';
import type {
	BuildQueryResult,
	BuildRelationalQueryResult,
	DBQueryConfig,
	TableRelationalConfig,
	TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, QueryWithTypings, SQL, SQLWrapper } from '~/sql/sql.ts';
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
		config: DBQueryConfig<'many' | 'one'> | true,
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

	constructor(
		private schema: TSchema,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
		private parseJson: boolean,
		private builder: PgRelationalQueryConstructor = PgRelationalQuery,
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
