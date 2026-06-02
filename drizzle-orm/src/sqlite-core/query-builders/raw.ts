import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { PreparedQueryConfig, SQLitePreparedQuery } from '../session.ts';

// TODO: remove Raw builders & replace them with preparedQuery instances directly
export interface SQLiteRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'sqlite'>, SQLWrapper {}
export class SQLiteRaw<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper, PreparedQuery
{
	static override readonly [entityKind]: string = 'SQLiteRaw';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly result: TResult;
	};

	constructor(
		protected prepared: SQLitePreparedQuery<
			PreparedQueryConfig & {
				execute: TResult;
			}
		>,
		protected sql: SQL,
		protected query: Query,
	) {
		super();
	}

	override execute(placeholderValues?: Record<string, undefined>): Promise<TResult> {
		return this.prepared.execute(placeholderValues) as Promise<TResult>;
	}

	getSQL() {
		return this.sql;
	}

	getQuery() {
		return this.query;
	}

	_prepare(): PreparedQuery {
		return this.prepared;
	}
}
