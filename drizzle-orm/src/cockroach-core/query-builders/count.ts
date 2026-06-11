import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query } from '~/sql/sql.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import type { CockroachDialect } from '../dialect.ts';
import type { CockroachSession } from '../session.ts';
import type { CockroachTable } from '../table.ts';
import type { CockroachViewBase } from '../view-base.ts';

// oxlint-disable-next-line no-unused-vars
export interface CockroachCountBuilder extends SQL<number>, SQLWrapper<number>, QueryPromise<number> {}

export class CockroachCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'CockroachCountBuilder';

	protected dialect: CockroachDialect;
	protected session: CockroachSession<any, any, any>;

	private static buildCount(
		source: CockroachTable | CockroachViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
		parens?: boolean,
	): SQL<number> {
		const where = sql` where ${filters}`.if(filters);
		const query = sql<number>`select count(*) from ${source}${where}`;

		return parens ? sql`(${query})` : query;
	}

	constructor(
		protected countConfig: {
			source: CockroachTable | CockroachViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: CockroachDialect;
			session: CockroachSession<any, any, any>;
		},
	) {
		super(CockroachCountBuilder.buildCount(countConfig.source, countConfig.filters, true).queryChunks);
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
			this.executableSql = CockroachCountBuilder.buildCount(source, filters);
		}

		return this.dialect.sqlToQuery(this.executableSql);
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return this.session.prepareQuery(
			this.build(),
			undefined,
			undefined,
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues) as any;
	}
}

applyMixins(CockroachCountBuilder, [QueryPromise]);
