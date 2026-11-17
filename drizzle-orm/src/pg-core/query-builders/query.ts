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
import type { PgDialect } from '../dialect.ts';
import type { PgSession } from '../session.ts';
import type { PgTable } from '../table.ts';

export type PgDBQueryConfigRoot<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = DBQueryConfigRoot<TRelationType, TSchema, TTableConfig>;

export interface PgRelationalQueryConstructor {
	new(
		schema: TablesRelationalConfig,
		table: PgTable,
		tableConfig: TableRelationalConfig,
		dialect: PgDialect,
		session: PgSession,
		config: PgDBQueryConfigRoot<'many' | 'one'> | true,
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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		private schema: TSchema,
		private table: PgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
		private parseJson: boolean,
		private builder: PgRelationalQueryConstructor = PgRelationalQuery,
	) {}

	findMany<TConfig extends PgDBQueryConfigRoot<'many', TSchema, TFields>>(
		config?: PgDBQueryConfigRoot<'many', TSchema, TFields> extends TConfig ? TConfig
			: PgDBQueryConfigRoot<'many', TSchema, TFields>,
	): PgRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as PgDBQueryConfigRoot<'many'> | undefined ?? true,
			'many',
			this.parseJson,
		);
	}

	findFirst<TConfig extends PgDBQueryConfigRoot<'one', TSchema, TFields>>(
		config?: PgDBQueryConfigRoot<'one', TSchema, TFields> extends TConfig ? TConfig
			: PgDBQueryConfigRoot<'one', TSchema, TFields>,
	): PgRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as PgDBQueryConfigRoot<'one'> | undefined ?? true,
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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	protected mapper?: RelationalRowsMapper;

	/** @internal */
	protected shape?: any;

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
		protected config: PgDBQueryConfigRoot<'many' | 'one'> | true,
		protected mode: 'many' | 'first',
		protected parseJson: boolean,
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

	getSQL(): SQL {
		return this._getQuery().sql;
	}

	protected _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query; usedTables: Set<string> | undefined } {
		const usedTables = relationalQueryUsedTablesInit(this.config);
		const query = this._getQuery(usedTables);

		const builtQuery = this.dialect.sqlToQuery(query.sql);

		return { query, builtQuery, usedTables };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}
}
