import { entityKind } from '~/entity.ts';
import { RunnableQueryMixin } from '~/query-builders/runnable.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { applyMixins } from '~/utils.ts';
import { PgRelationalQuery, type PgRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { PgAsyncRuntimeHKT, PgAsyncSession } from './session.ts';

export type AnyPgAsyncRelationalQuery = PgAsyncRelationalQuery<any>;

export interface PgAsyncRelationalQueryHKT extends PgRelationalQueryHKTBase {
	runtime: PgAsyncRuntimeHKT;
	_type: PgAsyncRelationalQuery<this['result']>;
}

export interface PgAsyncRelationalQuery<TResult> extends QueryPromise<TResult> {
}
export class PgAsyncRelationalQuery<TResult> extends PgRelationalQuery<PgAsyncRelationalQueryHKT, TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgAsyncRelationalQueryV2';

	declare protected session: PgAsyncSession;
}

applyMixins(PgAsyncRelationalQuery, [QueryPromise, RunnableQueryMixin]);
