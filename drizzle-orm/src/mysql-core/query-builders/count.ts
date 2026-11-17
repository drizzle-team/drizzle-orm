import { entityKind } from '~/entity.ts';
import { type Query, SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';

export class MySqlCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'MySqlCountBuilder';

	private dialect: MySqlDialect;

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
		},
	) {
		super(MySqlCountBuilder.buildCount(countConfig.source, countConfig.filters, true).queryChunks);
		this.dialect = countConfig.dialect;
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
}
