import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, type Assume, type NeonAuthToken } from '~/utils.ts';
import type { PgInsertHKTBase } from '../query-builders/insert.ts';
import { PgInsertBase } from '../query-builders/insert.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

export interface PgAsyncInsertHKT extends PgInsertHKTBase {
	_type: PgAsyncInsertBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		this['selectedFields'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnyPgAsyncInsert = PgAsyncInsertBase<any, any, any, any, any, any>;

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
> extends QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {
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
> extends PgInsertBase<
	PgAsyncInsertHKT,
	TTable,
	TQueryResult,
	TSelectedFields,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'> {
	static override readonly [entityKind]: string = 'PgAsyncInsert';

	declare protected session: PgAsyncSession;

	/** @internal */
	_prepare(name?: string): PgInsertPrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			}, this.cacheConfig).setToken(this.authToken);
		});
	}

	prepare(name: string): PgInsertPrepare<this> {
		return this._prepare(name);
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyMixins(PgAsyncInsertBase, [QueryPromise]);
