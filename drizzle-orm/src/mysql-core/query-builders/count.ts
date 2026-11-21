import { entityKind } from '~/entity.ts';
import { type Query, SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlBasePreparedQuery, MySqlRuntimeHKT, MySqlRuntimeKind, MySqlSession } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';

export class MySqlCountBuilder<TRuntime extends MySqlRuntimeHKT = MySqlRuntimeHKT> extends SQL<number>
	implements SQLWrapper<number>
{
	static override readonly [entityKind]: string = 'MySqlCountBuilder';

	private dialect: MySqlDialect;

	protected session: MySqlSession;

	private static buildCount(
		source: MySqlTable | MySqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
		parens?: boolean,
	): SQL<number> {
		const where = sql` where ${filters}`.if(filters);
		const query = sql<number>`select count(*) from ${source}${where}`;

		return parens ? sql`(${query})` : query;
	}

	constructor(
		protected countConfig: {
			source: MySqlTable | MySqlViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: MySqlDialect;
			session: MySqlSession;
		},
	) {
		super(MySqlCountBuilder.buildCount(countConfig.source, countConfig.filters, true).queryChunks);
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
			this.executableSql = MySqlCountBuilder.buildCount(source, filters);
		}

		return this.dialect.sqlToQuery(this.executableSql);
	}

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way.
	 */
	execute(placeholderValues?: Record<string, unknown>): MySqlRuntimeKind<TRuntime, number>['execute'] {
		return this._prepare().execute(placeholderValues) as MySqlRuntimeKind<TRuntime, number>['execute'];
	}

	/** @internal */
	_prepare(): MySqlBasePreparedQuery {
		return this.session.prepareQuery(
			this.build(),
			'arrays',
			(rows) => {
				const v = (rows[0] as unknown[] | undefined)?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		);
	}
}
