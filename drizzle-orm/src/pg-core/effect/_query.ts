import type { Effect } from 'effect/Effect';
import * as V1 from '~/_relations.ts';
import { QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, QueryWithTypings, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgTable } from '../table.ts';
import type { EffectPgCorePreparedQuery } from './prepared-query.ts';
import type { EffectPgCoreSession } from './session.ts';

export class _EffectRelationalQueryBuilder<
	TSchema extends V1.TablesRelationalConfig,
	TFields extends V1.TableRelationalConfig,
> {
	static readonly [entityKind]: string = 'PgRelationalQueryBuilder';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: PgTable,
		private tableConfig: V1.TableRelationalConfig,
		private dialect: PgDialect,
		private session: EffectPgCoreSession,
	) {}

	findMany<TConfig extends V1.DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, V1.DBQueryConfig<'many', true, TSchema, TFields>>,
	): _EffectPgRelationalQuery<V1.BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new _EffectPgRelationalQuery(
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
	): _EffectPgRelationalQuery<V1.BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		return new _EffectPgRelationalQuery(
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

export class _EffectPgRelationalQuery<TResult> extends QueryEffect<TResult, DrizzleQueryError>
	implements RunnableQuery<TResult, 'pg'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'PgRelationalQuery';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: V1.TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: PgTable,
		private tableConfig: V1.TableRelationalConfig,
		private dialect: PgDialect,
		private session: EffectPgCoreSession,
		private config: V1.DBQueryConfig<'many', true> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	/** @internal */
	_prepare(name?: string): EffectPgCorePreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		const { query, builtQuery } = this._toSQL();

		return this.session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
			builtQuery,
			undefined,
			name,
			true,
			(rawRows, mapColumnValue) => {
				const rows = rawRows.map((row) =>
					V1.mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
				);
				if (this.mode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		);
	}

	prepare(name: string): EffectPgCorePreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
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

	/** @internal */
	getSQL(): SQL {
		return this._getQuery().sql as SQL;
	}

	private _toSQL(): { query: V1.BuildRelationalQueryResult; builtQuery: QueryWithTypings } {
		const query = this._getQuery();

		const builtQuery = this.dialect.sqlToQuery(query.sql as SQL);

		return { query, builtQuery };
	}

	toSQL(): Query {
		return this._toSQL().builtQuery;
	}

	override execute(): Effect<TResult, DrizzleQueryError> {
		return this._prepare().execute(undefined);
	}
}
