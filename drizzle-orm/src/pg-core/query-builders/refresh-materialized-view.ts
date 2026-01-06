import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PgSession } from '~/pg-core/session.ts';
import type { PgMaterializedView } from '~/pg-core/view.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';

// eslint-disable-next-line no-unused-vars
export class PgRefreshMaterializedView<TQueryResult extends PgQueryResultHKT> implements SQLWrapper {
	static readonly [entityKind]: string = 'PgRefreshMaterializedView';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: PgQueryResultKind<TQueryResult, never>;
	};

	protected config: {
		view: PgMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: PgMaterializedView,
		protected session: PgSession,
		protected dialect: PgDialect,
	) {
		this.config = { view };
	}

	concurrently(): this {
		if (this.config.withNoData !== undefined) {
			throw new Error('Cannot use concurrently and withNoData together');
		}
		this.config.concurrently = true;
		return this;
	}

	withNoData(): this {
		if (this.config.concurrently !== undefined) {
			throw new Error('Cannot use concurrently and withNoData together');
		}
		this.config.withNoData = true;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildRefreshMaterializedViewQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}
}
