import { entityKind, is } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import {
	type BuildQueryResult,
	type BuildRelationalQueryResult,
	type DBQueryConfigRoot,
	relationalQueryCacheConfig,
	relationalQueryCacheMetadata,
	relationalQueryUsedTablesInit,
	type RelationalRowsMapper,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { SingleStoreDialect } from '../dialect.ts';
import type {
	PreparedQueryHKTBase,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStoreSession,
} from '../session.ts';
import type { SingleStoreTable } from '../table.ts';
import type { SingleStoreView } from '../view.ts';

export type SingleStoreDBQueryConfigRoot<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = Omit<DBQueryConfigRoot<TRelationType, TSchema, TTableConfig>, 'strategy' | 'comment'>;

export class RelationalQueryBuilder<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'SingleStoreRelationalQueryBuilderV2';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		private schema: TSchema,
		private table: SingleStoreTable | SingleStoreView,
		private tableConfig: TableRelationalConfig,
		private dialect: SingleStoreDialect,
		private session: SingleStoreSession,
	) {}

	findMany<TConfig extends SingleStoreDBQueryConfigRoot<'many', TSchema, TFields>>(
		config?: SingleStoreDBQueryConfigRoot<'many', TSchema, TFields> extends TConfig ? TConfig
			: SingleStoreDBQueryConfigRoot<'many', TSchema, TFields>,
	): SingleStoreRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new SingleStoreRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as SingleStoreDBQueryConfigRoot<'many'> | undefined ?? true,
			'many',
		);
	}

	findFirst<TSelection extends SingleStoreDBQueryConfigRoot<'one', TSchema, TFields>>(
		config?: SingleStoreDBQueryConfigRoot<'one', TSchema, TFields> extends TSelection ? TSelection
			: SingleStoreDBQueryConfigRoot<'one', TSchema, TFields>,
	): SingleStoreRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new SingleStoreRelationalQuery(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as SingleStoreDBQueryConfigRoot<'one'> | undefined ?? true,
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

	declare protected $brand: 'SingleStoreRelationalQuery';

	constructor(
		private schema: TablesRelationalConfig,
		private table: SingleStoreTable | SingleStoreView,
		private tableConfig: TableRelationalConfig,
		private dialect: SingleStoreDialect,
		private session: SingleStoreSession,
		private config: SingleStoreDBQueryConfigRoot<'many' | 'one'> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	prepare() {
		const { query, builtQuery, usedTables } = this._toSQL();
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
			relationalQueryCacheMetadata(this.config, query.sql, usedTables, this),
			relationalQueryCacheConfig(this.config),
		) as PreparedQueryKind<TPreparedQueryHKT, SingleStorePreparedQueryConfig & { execute: TResult }, true>;
	}

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

	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: Query; usedTables: Set<string> | undefined } {
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

	override execute(): Promise<TResult> {
		return this.prepare().execute();
	}
}
