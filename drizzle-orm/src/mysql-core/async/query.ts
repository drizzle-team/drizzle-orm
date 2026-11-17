import { entityKind } from '~/entity.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins } from '~/utils.ts';
import { MySqlRelationalQuery, type MySqlRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { MySqlAsyncRuntimeHKT, MySqlAsyncSession } from './session.ts';

export type AnyMySqlAsyncRelationalQuery = MySqlAsyncRelationalQuery<any>;

export interface MySqlAsyncRelationalQueryHKT extends MySqlRelationalQueryHKTBase {
	runtime: MySqlAsyncRuntimeHKT;
	_type: MySqlAsyncRelationalQuery<this['result']>;
}

export interface MySqlAsyncRelationalQuery<TResult> extends QueryPromise<TResult> {}
export class MySqlAsyncRelationalQuery<TResult> extends MySqlRelationalQuery<MySqlAsyncRelationalQueryHKT, TResult> {
	static override readonly [entityKind]: string = 'MySqlAsyncRelationalQueryV2';

	declare protected session: MySqlAsyncSession;
}

applyMixins(MySqlAsyncRelationalQuery, [QueryPromise, RunnableQueryMixin]);
