import { entityKind } from '~/entity.ts';
import type { Query } from '~/sql/sql.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLitePreparedQuery } from '~/sqlite-core/session.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';
import type { SQLiteViewBase } from '../view-base.ts';

export class SQLiteCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'SQLiteCountBuilder';

	protected dialect: SQLiteDialect;
	protected session: SQLiteSession<any, any>;

	private static buildCount(
		source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
		parens?: boolean,
	): SQL<number> {
		const where = sql` where ${filters}`.if(filters);
		const query = sql<number>`select count(*) from ${source}${where}`;

		return parens ? sql`(${query})` : query;
	}

	constructor(
		protected countConfig: {
			source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: SQLiteDialect;
			session: SQLiteSession<any, any>;
		},
	) {
		super(SQLiteCountBuilder.buildCount(countConfig.source, countConfig.filters, true).queryChunks);
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
			this.executableSql = SQLiteCountBuilder.buildCount(source, filters);
		}

		return this.dialect.sqlToQuery(this.executableSql);
	}

	/** @internal */
	_prepare(): SQLitePreparedQuery {
		return this.session.prepareQuery(
			this.build(),
			'arrays',
			false,
			'all', // Do not use 'get' - mapper returns an item instead of an array, would break on session's destructuring; query itself is already aggregated into 1 item, so no performance overhead occurs.
			(rows) => {
				const v = (rows[0] as unknown[] | undefined)?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		);
	}

	/** Runs the count: the runtime's builder narrows the return type */
	execute(placeholderValues?: Record<string, unknown>): unknown {
		return this._prepare().execute(placeholderValues);
	}
}
