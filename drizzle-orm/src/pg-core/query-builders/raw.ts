import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';

// oxlint-disable-next-line no-unused-vars
export interface PgRaw<TResult> extends SQLWrapper {}
export class PgRaw<TResult> implements SQLWrapper, PreparedQuery {
	static readonly [entityKind]: string = 'PgRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		protected sql: SQL,
		protected query: Query,
		protected mapBatchResult: (result: unknown) => unknown,
	) {
	}

	/** @internal */
	getSQL() {
		return this.sql;
	}

	getQuery() {
		return this.query;
	}

	mapResult(result: unknown, isFromBatch?: boolean) {
		return isFromBatch ? this.mapBatchResult(result) : result;
	}

	/** @internal */
	isResponseInArrayMode() {
		return false;
	}
}
