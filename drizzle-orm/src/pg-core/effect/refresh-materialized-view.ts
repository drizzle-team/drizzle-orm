import { QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgMaterializedView } from '~/pg-core/view.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { EffectPgCorePreparedQuery } from './prepared-query.ts';
import type { EffectPgCoreSession } from './session.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EffectPgRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends
		QueryEffect<PgQueryResultKind<TQueryResult, never>, DrizzleQueryError>,
		RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>,
		SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly result: PgQueryResultKind<TQueryResult, never>;
	};
}

export class EffectPgRefreshMaterializedView<TQueryResult extends PgQueryResultHKT>
	extends QueryEffect<PgQueryResultKind<TQueryResult, never>, DrizzleQueryError>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'PgRefreshMaterializedView';

	private config: {
		view: PgMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: PgMaterializedView,
		private session: EffectPgCoreSession,
		private dialect: PgDialect,
	) {
		super();
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

	/** @internal */
	_prepare(name?: string): EffectPgCorePreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
	}

	prepare(name: string): EffectPgCorePreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
