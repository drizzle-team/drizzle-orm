import { entityKind, is } from '~/entity.ts';
import {
	type BuildQueryResult,
	type BuildRelationalQueryResult,
	type DBQueryConfigRoot,
	relationalQueryUsedTablesInit,
	type RelationalRowsMapper,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlSession } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlView } from '../view.ts';

export type MySqlDBQueryConfigRoot<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = DBQueryConfigRoot<TRelationType, TSchema, TTableConfig>;

export interface MySqlRelationalQueryConstructor {
	new(
		schema: TablesRelationalConfig,
		table: MySqlTable | MySqlView,
		tableConfig: TableRelationalConfig,
		dialect: MySqlDialect,
		session: MySqlSession,
		config: MySqlDBQueryConfigRoot<'many' | 'one'> | true,
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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		private schema: TSchema,
		private table: MySqlTable | MySqlView,
		private tableConfig: TableRelationalConfig,
		private dialect: MySqlDialect,
		private session: MySqlSession,
		private builder: MySqlRelationalQueryConstructor = MySqlRelationalQuery,
	) {}

	findMany<TConfig extends MySqlDBQueryConfigRoot<'many', TSchema, TFields>>(
		config?: MySqlDBQueryConfigRoot<'many', TSchema, TFields> extends TConfig ? TConfig
			: MySqlDBQueryConfigRoot<'many', TSchema, TFields>,
	): MySqlRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as MySqlDBQueryConfigRoot<'many'> | undefined ?? true,
			'many',
		);
	}

	findFirst<TSelection extends MySqlDBQueryConfigRoot<'one', TSchema, TFields>>(
		config?: MySqlDBQueryConfigRoot<'one', TSchema, TFields> extends TSelection ? TSelection
			: MySqlDBQueryConfigRoot<'one', TSchema, TFields>,
	): MySqlRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as MySqlDBQueryConfigRoot<'one'> | undefined ?? true,
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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	protected mapper?: RelationalRowsMapper;

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
		protected config: MySqlDBQueryConfigRoot<'many' | 'one'> | true,
		protected mode: 'many' | 'first',
	) {}

	/** @internal */
	_getQuery(usedTables?: Set<string>) {
		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
			usedTables,
		});
	}

	protected _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query; usedTables: Set<string> | undefined } {
		const usedTables = relationalQueryUsedTablesInit(this.config);
		const query = this._getQuery(usedTables);

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { builtQuery, query, usedTables };
	}

	getSQL(): SQL {
		return this._getQuery().sql;
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}
}
