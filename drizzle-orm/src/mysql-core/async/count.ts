import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins } from '~/utils.ts';
import { MySqlCountBuilder } from '../query-builders/count.ts';
import type { MySqlAsyncRuntimeHKT, MySqlAsyncSession } from './session.ts';

export interface MySqlAsyncCountBuilder extends MySqlCountBuilder<MySqlAsyncRuntimeHKT>, QueryPromise<number> {}

export class MySqlAsyncCountBuilder extends MySqlCountBuilder<MySqlAsyncRuntimeHKT> {
	static override readonly [entityKind]: string = 'MySqlAsyncCountBuilder';

	declare protected session: MySqlAsyncSession;
}

applyMixins(MySqlAsyncCountBuilder, [QueryPromise]);
