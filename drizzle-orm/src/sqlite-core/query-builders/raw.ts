import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLitePreparedQuery } from '../session.ts';

// TODO: remove Raw builders & replace them with preparedQuery instances directly
// oxlint-disable-next-line no-unused-vars
export interface SQLiteRaw<TResult> extends SQLWrapper {}
export class SQLiteRaw<TResult> implements SQLWrapper, PreparedQuery {
	static readonly [entityKind]: string = 'SQLiteRaw';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly result: TResult;
	};

	constructor(
		protected prepared: SQLitePreparedQuery,
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

	_prepare(): PreparedQuery {
		return this.prepared;
	}
}
