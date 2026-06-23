import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { MySqlBasePreparedQuery } from '../session.ts';

// oxlint-disable-next-line no-unused-vars
export interface MySqlRaw<TResult> extends SQLWrapper {}
export class MySqlRaw<TResult> implements SQLWrapper, PreparedQuery {
	static readonly [entityKind]: string = 'MySqlRaw';

	declare readonly _: {
		readonly dialect: 'mysql';
		readonly result: TResult;
	};

	constructor(
		protected prepared: MySqlBasePreparedQuery,
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
