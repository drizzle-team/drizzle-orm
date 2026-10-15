import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { PgBasePreparedQuery } from '../session.ts';

// oxlint-disable-next-line no-unused-vars
export interface PgRaw<TResult> extends SQLWrapper {}
export class PgRaw<TResult> implements SQLWrapper, PreparedQuery {
	static readonly [entityKind]: string = 'PgRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		protected prepared: PgBasePreparedQuery,
		protected sql: SQL,
		protected query: Query,
	) {
	}

	getSQL() {
		return this.sql;
	}

	getQuery() {
		return this.query;
	}

	_prepare() {
		return this.prepared;
	}
}
