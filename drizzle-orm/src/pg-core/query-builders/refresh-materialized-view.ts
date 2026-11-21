import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type {
	PgBasePreparedQuery,
	PgQueryResultHKT,
	PgQueryResultKind,
	PgRunnableQueryMethods,
	PgSession,
} from '~/pg-core/session.ts';
import type { PgMaterializedView } from '~/pg-core/view.ts';
import type { QueryRuntimeHKT } from '~/query-builders/runtime.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';

export interface PgRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT,
	TRuntime extends QueryRuntimeHKT = QueryRuntimeHKT,
> extends PgRunnableQueryMethods<TRuntime, PgQueryResultKind<TQueryResult, never>> {
}

export class PgRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT,
	// oxlint-disable-next-line no-unused-vars
	TRuntime extends QueryRuntimeHKT = QueryRuntimeHKT,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'PgRefreshMaterializedView';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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

	getSQL(): SQL {
		return this.dialect.buildRefreshMaterializedViewQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	/**
	 * Prepares the query on the session, for both runtimes. The runtime's builder narrows the return type.
	 *
	 * @internal
	 */
	_prepare(name?: string, generateName = false): PgBasePreparedQuery {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.toSQL(), 'raw', name ?? generateName, undefined);
		});
	}
}
