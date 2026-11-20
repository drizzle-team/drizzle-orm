import { entityKind } from '~/entity.ts';
import type { QueryRuntimeHKT, QueryRuntimeKind } from '~/query-builders/runtime.ts';
import { type Query, SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgBasePreparedQuery, PgSession } from '../session.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';

export class PgCountBuilder<TRuntime extends QueryRuntimeHKT = QueryRuntimeHKT> extends SQL<number>
	implements SQLWrapper<number>
{
	static override readonly [entityKind]: string = 'PgCountBuilder';

	declare _: {
		brand: 'SQL';
		type: number;
		/** A runnable query: it runs on it's own, and as an item of a driver's `batch` */
		readonly dialect: 'pg';
		readonly result: number;
	};

	private dialect: PgDialect;

	protected session: PgSession;

	private static buildCount(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
		parens?: boolean,
	): SQL<number> {
		const where = sql` where ${filters}`.if(filters);
		const query = sql<number>`select count(*) from ${source}${where}`;

		return parens ? sql`(${query})` : query;
	}

	constructor(
		protected countConfig: {
			source: PgTable | PgViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: PgDialect;
			session: PgSession;
		},
	) {
		super(PgCountBuilder.buildCount(countConfig.source, countConfig.filters, true).queryChunks);
		this.dialect = countConfig.dialect;
		this.session = countConfig.session;
		this.mapWith((e) => {
			if (typeof e === 'number') return e;

			return Number(e ?? 0);
		});
	}

	private executableSql: SQL<number> | undefined;
	protected build(): Query {
		if (!this.executableSql) {
			const { source, filters } = this.countConfig;
			this.executableSql = PgCountBuilder.buildCount(source, filters);
		}

		return this.dialect.sqlToQuery(this.executableSql);
	}

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way, and passing it to a batch runs it there instead.
	 */
	execute(placeholderValues?: Record<string, unknown>): QueryRuntimeKind<TRuntime, number>['execute'] {
		return this._prepare().execute(placeholderValues) as QueryRuntimeKind<TRuntime, number>['execute'];
	}

	/**
	 * Prepares the count on the session, for both runtimes: run on it's own, or as an item of a driver's `batch`
	 *
	 * @internal
	 */
	_prepare(): PgBasePreparedQuery {
		return this.session.prepareQuery(
			this.build(),
			'arrays',
			false,
			(rows) => {
				const v = (rows[0] as unknown[] | undefined)?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		);
	}
}
