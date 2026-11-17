import { entityKind } from '~/entity.ts';
import { MySqlDeleteBase, type MySqlDeleteHKTBase } from '~/mysql-core/query-builders/delete.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { MySqlAsyncIterableQuery } from './iterable.ts';
import type { MySqlAsyncPreparedQuery, MySqlAsyncRuntimeHKT, MySqlAsyncSession } from './session.ts';

export type MySqlAsyncDelete<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
> = MySqlAsyncDeleteBase<TTable, TQueryResult, true, never>;

export type MySqlAsyncDeletePrepare<T extends AnyMySqlAsyncDelete> = MySqlAsyncPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: MySqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	}
>;

export type AnyMySqlAsyncDelete = MySqlAsyncDeleteBase<any, any, any, any>;

export interface MySqlAsyncDeleteHKT extends MySqlDeleteHKTBase {
	runtime: MySqlAsyncRuntimeHKT;
	_type: MySqlAsyncDeleteBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export interface MySqlAsyncDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<MySqlQueryResultKind<TQueryResult, never>> {
	/**
	 * Runs the query and returns an async iterator over it's rows, with values for any `sql.placeholder()` it contains.
	 * Streams rows when the driver supports it
	 */
	iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<never>;
}

export class MySqlAsyncDeleteBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends MySqlDeleteBase<MySqlAsyncDeleteHKT, TTable, TQueryResult, TDynamic, TExcludedMethods> {
	static override readonly [entityKind]: string = 'MySqlAsyncDelete';

	declare protected session: MySqlAsyncSession<TQueryResult, any>;
}

applyMixins(MySqlAsyncDeleteBase, [QueryPromise, RunnableQueryMixin, MySqlAsyncIterableQuery]);
