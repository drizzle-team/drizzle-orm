import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import { MySqlRaw } from '../query-builders/raw.ts';
import type { MySqlPreparedQueryConfig } from '../session.ts';
import type { MySqlAsyncPreparedQuery } from './session.ts';

export interface MySqlAsyncRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'mysql'>, SQLWrapper {}
export class MySqlAsyncRaw<TResult> extends MySqlRaw<TResult> implements RunnableQuery<TResult, 'mysql'> {
	static override readonly [entityKind]: string = 'MySqlAsyncRaw';

	declare readonly _: {
		readonly dialect: 'mysql';
		readonly result: TResult;
	};

	declare protected prepared: MySqlAsyncPreparedQuery<
		MySqlPreparedQueryConfig & {
			execute: TResult;
		}
	>;

	constructor(
		prepared: MySqlAsyncPreparedQuery<
			MySqlPreparedQueryConfig & {
				execute: TResult;
			}
		>,
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

applyMixins(MySqlAsyncRaw, [QueryPromise]);
