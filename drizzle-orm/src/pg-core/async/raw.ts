import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import { PgRaw } from '../query-builders/raw.ts';
import type { PgAsyncRuntimeHKT } from './session.ts';

export interface PgAsyncRaw<TResult> extends QueryPromise<TResult>, SQLWrapper {}
export class PgAsyncRaw<TResult> extends PgRaw<TResult, PgAsyncRuntimeHKT> implements RunnableQuery<TResult, 'pg'> {
	static override readonly [entityKind]: string = 'PgAsyncRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};
}

applyMixins(PgAsyncRaw, [QueryPromise]);
