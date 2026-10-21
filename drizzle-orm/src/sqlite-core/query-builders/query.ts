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
import { type Query, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';

export type SQLiteDBQueryConfigRoot<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = Omit<DBQueryConfigRoot<TRelationType, TSchema, TTableConfig>, 'strategy' | 'comment'>;

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
		config: SQLiteDBQueryConfigRoot<'many' | 'one'> | true,
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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		private mode: TMode,
		private schema: TSchema,
		private table: SQLiteTable,
		private tableConfig: TableRelationalConfig,
		private dialect: SQLiteDialect,
		private session: SQLiteSession<any, any>,
		private forbidJsonb: boolean | undefined,
		private builder: SQLiteRelationalQueryConstructor = SQLiteRelationalQuery,
	) {}

	findMany<TConfig extends SQLiteDBQueryConfigRoot<'many', TSchema, TFields>>(
		config?: SQLiteDBQueryConfigRoot<'many', TSchema, TFields> extends TConfig ? TConfig
			: SQLiteDBQueryConfigRoot<'many', TSchema, TFields>,
	): SQLiteRelationalQueryKind<TBuilderHKT, TMode, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.mode,
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as SQLiteDBQueryConfigRoot<'many'> | undefined ?? true,
			'many',
			this.forbidJsonb,
		) as any;
	}

	findFirst<TConfig extends SQLiteDBQueryConfigRoot<'one', TSchema, TFields>>(
		config?: SQLiteDBQueryConfigRoot<'one', TSchema, TFields> extends TConfig ? TConfig
			: SQLiteDBQueryConfigRoot<'one', TSchema, TFields>,
	): SQLiteRelationalQueryKind<TBuilderHKT, TMode, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new this.builder(
			this.mode,
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as SQLiteDBQueryConfigRoot<'one'> | undefined ?? true,
			'first',
			this.forbidJsonb,
		) as any;
	}
}

export class SQLiteRelationalQuery<THKT extends SQLiteRelationalQueryHKTBase, TResult> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteRelationalQueryV2';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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

	constructor(
		resultKind: unknown,
		protected schema: TablesRelationalConfig,
		table: SQLiteTable,
		protected tableConfig: TableRelationalConfig,
		protected dialect: SQLiteDialect,
		protected session: SQLiteSession<any, any>,
		protected config: SQLiteDBQueryConfigRoot<'many' | 'one'> | true,
		mode: 'many' | 'first',
		protected forbidJsonb?: boolean,
	) {
		this.resultKind = resultKind;
		this.mode = mode;
		this.table = table;
	}

	getSQL(): SQL {
		return this._getQuery().sql;
	}

	/** @internal */
	_getQuery(usedTables?: Set<string>) {
		const jsonb = this.forbidJsonb ? sql`json` : sql`jsonb`;

		return this.dialect.buildRelationalQuery({
			schema: this.schema,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			mode: this.mode,
			jsonb,
			usedTables,
		});
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
