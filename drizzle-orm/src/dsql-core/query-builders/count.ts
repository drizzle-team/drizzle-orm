import { entityKind } from '~/entity.ts';
import { type QueryWithTypings, SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLTable } from '../table.ts';
import type { DSQLViewBase } from '../view-base.ts';

export class DSQLCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'DSQLCountBuilder';

	private dialect: DSQLDialect;

	private static buildEmbeddedCount(
		source: DSQLTable | DSQLViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
		parens?: boolean,
	): SQL<number> {
		const where = sql` where ${filters}`.if(filters);
		const query = sql<number>`select count(*) from ${source}${where}`;

		return parens ? sql`(${query})` : query;
	}

	constructor(
		protected countConfig: {
			source: DSQLTable | DSQLViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: DSQLDialect;
		},
	) {
		super(DSQLCountBuilder.buildEmbeddedCount(countConfig.source, countConfig.filters, true).queryChunks);
		this.dialect = countConfig.dialect;
		this.mapWith((e) => {
			if (typeof e === 'number') return e;

			return Number(e ?? 0);
		});
	}

	protected build(): QueryWithTypings {
		const { filters, source } = this.countConfig;
		const query = DSQLCountBuilder.buildEmbeddedCount(source, filters);

		return this.dialect.sqlToQuery(query);
	}
}
