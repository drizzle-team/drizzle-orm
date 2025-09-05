import {
	type BuildQueryResult,
	type BuildRelationalQueryResult,
	type DBQueryConfig,
	mapRelationalRowFromObj,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, QueryWithTypings, SQL } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { MsSqlDialect } from '../dialect.ts';
import type { MsSqlSession, PreparedQueryConfig, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
import type { MsSqlTable } from '../table.ts';

export class RelationalQueryBuilder<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'MsSqlRelationalQueryBuilder';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: MsSqlTable,
		private tableConfig: TableRelationalConfig,
		private dialect: MsSqlDialect,
		private session: MsSqlSession,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): MsSqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new MsSqlRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? (config as DBQueryConfig<'many', true>) : {},
			'many',
		);
	}

	findFirst<TSelection extends Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): MsSqlRelationalQuery<TPreparedQueryHKT, BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new MsSqlRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
			'first',
		);
	}
}

export class MsSqlRelationalQuery<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TResult,
> extends QueryPromise<TResult> {
	static override readonly [entityKind]: string = 'MsSqlRelationalQuery';

	declare protected $brand: 'MsSqlRelationalQuery';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: MsSqlTable,
		private tableConfig: TableRelationalConfig,
		private dialect: MsSqlDialect,
		private session: MsSqlSession,
		private config: DBQueryConfig<'many', true> | true,
		private queryMode: 'many' | 'first',
	) {
		super();
	}

	prepare() {
		const { query, builtQuery } = this._toSQL();
		return this.session.prepareQuery(
			builtQuery,
			undefined,
			(rawRows) => {
				const rows = rawRows.map((row) => mapRelationalRowFromObj(this.schema, this.tableConfig, row, query.selection));
				if (this.queryMode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		) as PreparedQueryKind<TPreparedQueryHKT, PreparedQueryConfig & { execute: TResult }, true>;
	}

	private _getQuery() {
		return this.dialect.buildRelationalQuery({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName,
		});
	}

	private _toSQL(): { query: BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql as SQL);

		return { builtQuery, query };
	}

	/** @internal */
	getSQL(): SQL {
		return this._getQuery().sql as SQL;
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	override execute(): Promise<TResult> {
		return this.prepare().execute();
	}
}
