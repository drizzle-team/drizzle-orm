import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query } from '~/sql/sql.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlSession } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';

export class MySqlCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'MySqlCountBuilder';

	protected dialect: MySqlDialect;
	protected session: MySqlSession;

	private static buildEmbeddedCount(
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
		super(MySqlCountBuilder.buildEmbeddedCount(countConfig.source, countConfig.filters, true).queryChunks);
		this.dialect = countConfig.dialect;
		this.session = countConfig.session;
		this.mapWith((e) => {
			if (typeof e === 'number') return e;

			return Number(e ?? 0);
		});
	}

	protected build(): Query {
		const { filters, source } = this.countConfig;
		const query = MySqlCountBuilder.buildEmbeddedCount(source, filters);

		return this.dialect.sqlToQuery(query);
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return this.session.prepareQuery<{
			execute: number;
			iterator: unknown;
		}>(
			this.build(),
			'arrays',
			false,
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues);
	}
}

applyMixins(MySqlCountBuilder, [QueryPromise]);
