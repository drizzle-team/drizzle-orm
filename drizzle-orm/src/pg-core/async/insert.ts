import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, type NeonAuthToken } from '~/utils.ts';
import type { PgInsertHKTBase } from '../query-builders/insert.ts';
import { PgInsertBase } from '../query-builders/insert.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

export interface PgAsyncInsertHKT extends PgInsertHKTBase {
	_type: PgAsyncInsertBase<
		this['table'],
		this['queryResult'],
		this['selectedFields'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods'],
		this['result']
	>;
}

export type AnyPgAsyncInsert = PgAsyncInsertBase<any, any, any, any, any, any, any>;

export type PgInsertPrepare<T extends AnyPgAsyncInsert> = PgAsyncPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type PgAsyncInsert<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgAsyncInsertBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface PgAsyncInsertBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TResult = TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
> extends QueryPromise<TResult> {
}

export class PgAsyncInsertBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TResult = TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
> extends PgInsertBase<
	PgAsyncInsertHKT,
	TTable,
	TQueryResult,
	TSelectedFields,
	TReturning,
	TDynamic,
	TExcludedMethods,
	TResult
> implements RunnableQuery<TResult, 'pg'> {
	static override readonly [entityKind]: string = 'PgAsyncInsert';

	declare protected session: PgAsyncSession;

	/** @internal */
	_prepare(name?: string): PgInsertPrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TResult;
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			}, this.cacheConfig);
		});
	}

	prepare(name: string): PgInsertPrepare<this> {
		return this._prepare(name);
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			// @ts-ignore - TODO
			return this._prepare().execute(placeholderValues, this.authToken);
		});
	};
}

applyMixins(PgAsyncInsertBase, [QueryPromise]);
