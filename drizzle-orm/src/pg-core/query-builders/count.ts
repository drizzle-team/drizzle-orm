import { entityKind } from '~/entity.ts';
import { type QueryWithTypings, SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';

export class PgCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'PgCountBuilder';

	private dialect: PgDialect;

	private static buildEmbeddedCount(
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
		},
	) {
		super(PgCountBuilder.buildEmbeddedCount(countConfig.source, countConfig.filters, true).queryChunks);
		this.dialect = countConfig.dialect;
		this.mapWith((e) => {
			if (typeof e === 'number') return e;

			return Number(e ?? 0);
		});
	}

	protected build(): QueryWithTypings {
		const { filters, source } = this.countConfig;
		const query = PgCountBuilder.buildEmbeddedCount(source, filters);

		return this.dialect.sqlToQuery(query);
	}
}
