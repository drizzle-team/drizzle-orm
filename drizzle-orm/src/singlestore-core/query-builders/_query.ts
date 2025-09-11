import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, QueryWithTypings, SQL } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { SingleStoreDialect } from '../dialect.ts';
import type {
	PreparedQueryHKTBase,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStoreSession,
} from '../session.ts';
import type { SingleStoreTable } from '../table.ts';

export class _RelationalQueryBuilder<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TSchema extends V1.TablesRelationalConfig,
	TFields extends V1.TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'SingleStoreRelationalQueryBuilder';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: SingleStoreTable,
		private tableConfig: V1.TableRelationalConfig,
		private dialect: SingleStoreDialect,
		private session: SingleStoreSession,
	) {}

	findMany<TConfig extends V1.DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, V1.DBQueryConfig<'many', true, TSchema, TFields>>,
	): SingleStoreRelationalQuery<TPreparedQueryHKT, V1.BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new SingleStoreRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? (config as V1.DBQueryConfig<'many', true>) : {},
			'many',
		);
	}

	findFirst<TSelection extends Omit<V1.DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<V1.DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): SingleStoreRelationalQuery<TPreparedQueryHKT, V1.BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new SingleStoreRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config ? { ...(config as V1.DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
			'first',
		);
	}
}

export class SingleStoreRelationalQuery<
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TResult,
> extends QueryPromise<TResult> {
	static override readonly [entityKind]: string = 'SingleStoreRelationalQuery';

	declare protected $brand: 'SingleStoreRelationalQuery';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: V1.TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: SingleStoreTable,
		private tableConfig: V1.TableRelationalConfig,
		private dialect: SingleStoreDialect,
		private session: SingleStoreSession,
		private config: V1.DBQueryConfig<'many', true> | true,
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
				const rows = rawRows.map((row) => V1.mapRelationalRow(this.schema, this.tableConfig, row, query.selection));
				if (this.queryMode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		) as PreparedQueryKind<TPreparedQueryHKT, SingleStorePreparedQueryConfig & { execute: TResult }, true>;
	}

	private _getQuery() {
		return this.dialect._buildRelationalQuery({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName,
		});
	}

	private _toSQL(): { query: V1.BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
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
