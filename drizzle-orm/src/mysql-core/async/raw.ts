import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import { MySqlRaw } from '../query-builders/raw.ts';
import type { MySqlAsyncRuntimeHKT } from './session.ts';

export interface MySqlAsyncRaw<TResult> extends QueryPromise<TResult>, SQLWrapper {}
export class MySqlAsyncRaw<TResult> extends MySqlRaw<TResult, MySqlAsyncRuntimeHKT>
	implements RunnableQuery<TResult, 'mysql'>
{
	static override readonly [entityKind]: string = 'MySqlAsyncRaw';

	declare readonly _: {
		readonly dialect: 'mysql';
		readonly result: TResult;
	};
}

applyMixins(MySqlAsyncRaw, [QueryPromise]);
