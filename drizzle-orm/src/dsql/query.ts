import type { DSQLDialect } from '~/dsql-core/dialect.ts';
import type { DSQLBasePreparedQuery, PreparedQueryConfig } from '~/dsql-core/session.ts';
import type { DSQLTable } from '~/dsql-core/table.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import {
	type BuildRelationalQueryResult,
	type DBQueryConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, QueryWithTypings, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins } from '~/utils.ts';
import type { DSQLDriverSession } from './session.ts';

export interface DSQLRelationalQueryConstructor {
	new(
		schema: TablesRelationalConfig,
		table: DSQLTable,
		tableConfig: TableRelationalConfig,
		dialect: DSQLDialect,
		session: DSQLDriverSession<any, any, any>,
		config: DBQueryConfig<'many' | 'one'> | true,
		mode: 'many' | 'first',
		parseJson: boolean,
	): AnyDSQLRelationalQuery;
}

export type AnyDSQLRelationalQuery = DSQLRelationalQuery<any>;

export interface DSQLRelationalQueryHKTBase {
	result: unknown;
	_type: unknown;
}

export interface DSQLRelationalQueryHKT extends DSQLRelationalQueryHKTBase {
	_type: DSQLRelationalQuery<this['result']>;
}

export type DSQLRelationalQueryKind<
	T extends DSQLRelationalQueryHKTBase,
	TResult,
> = (T & {
	result: TResult;
})['_type'];

export interface DSQLRelationalQuery<TResult> extends QueryPromise<TResult> {}
export class DSQLRelationalQuery<TResult> implements SQLWrapper, RunnableQuery<TResult, 'dsql'> {
	static readonly [entityKind]: string = 'DSQLRelationalQuery';

	declare readonly _: {
		readonly dialect: 'dsql';
		readonly result: TResult;
	};

	constructor(
		protected schema: TablesRelationalConfig,
		protected table: DSQLTable,
		protected tableConfig: TableRelationalConfig,
		protected dialect: DSQLDialect,
		protected session: DSQLDriverSession<any, any, any>,
		protected config: DBQueryConfig<'many' | 'one'> | true,
		protected mode: 'many' | 'first',
		protected parseJson: boolean,
	) {}

	protected _getQuery(): BuildRelationalQueryResult {
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

	/** @internal */
	_prepare(name?: string): DSQLBasePreparedQuery {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { query, builtQuery } = this._toSQL();

			return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				undefined,
				name,
				(rawRows, mapColumnValue) => {
					const rows = rawRows.map((row) => mapRelationalRow(row, query.selection, mapColumnValue, this.parseJson));
					if (this.mode === 'first') {
						return rows[0] as TResult;
					}
					return rows as TResult;
				},
			);
		});
	}

	prepare(name: string): DSQLBasePreparedQuery {
		return this._prepare(name);
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues) as Promise<TResult>;
		});
	}
}

applyMixins(DSQLRelationalQuery, [QueryPromise]);
