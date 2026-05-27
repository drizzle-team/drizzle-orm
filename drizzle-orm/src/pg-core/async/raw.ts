import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import { PgRaw } from '../query-builders/raw.ts';
import type { PgAsyncPreparedQuery } from './session.ts';

export interface PgAsyncRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'pg'>, SQLWrapper {}
export class PgAsyncRaw<TResult> extends PgRaw<TResult> implements RunnableQuery<TResult, 'pg'> {
	static override readonly [entityKind]: string = 'PgAsyncRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	declare protected prepared: PgAsyncPreparedQuery<{
		execute: TResult;
	}>;

	constructor(
		prepared: PgAsyncPreparedQuery<{
			execute: TResult;
		}>,
		sql: SQL,
		query: Query,
	) {
		super(prepared, sql, query);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.prepared.execute(placeholderValues);
	}

	override _prepare() {
		return this.prepared;
	}
}

applyMixins(PgAsyncRaw, [QueryPromise]);
