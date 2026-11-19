import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins } from '~/utils.ts';
import { PgCountBuilder } from '../query-builders/count.ts';
import type { BasePgAsyncSession, PgAsyncRuntimeHKT } from './session.ts';

export interface PgAsyncCountBuilder extends PgCountBuilder<PgAsyncRuntimeHKT>, QueryPromise<number> {}

export class PgAsyncCountBuilder extends PgCountBuilder<PgAsyncRuntimeHKT> {
	static override readonly [entityKind]: string = 'PgAsyncCountBuilder';

	declare protected session: BasePgAsyncSession;
}

applyMixins(PgAsyncCountBuilder, [QueryPromise]);
