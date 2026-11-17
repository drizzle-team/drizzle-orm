import { entityKind } from '~/entity.ts';
import { MySqlInsertBase, type MySqlInsertHKTBase } from '~/mysql-core/query-builders/insert.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { MySqlAsyncIterableQuery } from './iterable.ts';
import type { MySqlAsyncPreparedQuery, MySqlAsyncRuntimeHKT, MySqlAsyncSession } from './session.ts';

export interface MySqlAsyncInsertHKT extends MySqlInsertHKTBase {
	runtime: MySqlAsyncRuntimeHKT;
	_type: MySqlAsyncInsertBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnyMySqlAsyncInsert = MySqlAsyncInsertBase<any, any, any, any, any>;

export type MySqlAsyncInsertPrepare<
	T extends AnyMySqlAsyncInsert,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = MySqlAsyncPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: TReturning extends undefined ? MySqlQueryResultKind<T['_']['queryResult'], never> : TReturning[];
		iterator: never;
	}
>;

export type MySqlAsyncInsert<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = MySqlAsyncInsertBase<TTable, TQueryResult, TReturning, true, never>;

export interface MySqlAsyncInsertBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[]> {
	/**
	 * Runs the query and returns an async iterator over it's rows, with values for any `sql.placeholder()` it contains.
	 * Streams rows when the driver supports it
	 */
	iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<never>;
}

export class MySqlAsyncInsertBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends MySqlInsertBase<MySqlAsyncInsertHKT, TTable, TQueryResult, TReturning, TDynamic, TExcludedMethods>
	implements
		RunnableQuery<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[], 'mysql'>
{
	static override readonly [entityKind]: string = 'MySqlAsyncInsert';

	declare protected session: MySqlAsyncSession<TQueryResult, any>;
}

applyMixins(MySqlAsyncInsertBase, [QueryPromise, RunnableQueryMixin, MySqlAsyncIterableQuery]);
