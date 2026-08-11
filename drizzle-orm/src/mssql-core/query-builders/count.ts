import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query } from '~/sql/sql.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import type { MsSqlDialect } from '../dialect.ts';
import type { MsSqlSession, PreparedQueryConfig, PreparedQueryHKTBase } from '../session.ts';
import type { MsSqlTable } from '../table.ts';
import type { MsSqlViewBase } from '../view-base.ts';

// oxlint-disable-next-line no-unused-vars
export interface MsSqlCountBuilder extends SQL<number>, SQLWrapper<number>, QueryPromise<number> {}

export class MsSqlCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'MsSqlCountBuilder';

	protected dialect: MsSqlDialect;
	protected session: MsSqlSession<any, any, any, any>;

	private static buildCount(
		source: MsSqlTable | MsSqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
		parens?: boolean,
	): SQL<number> {
		const where = sql` where ${filters}`.if(filters);
		const query = sql<number>`select count(*) from ${source}${where}`;

		return parens ? sql`(${query})` : query;
	}

	constructor(
		protected countConfig: {
			source: MsSqlTable | MsSqlViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: MsSqlDialect;
			session: MsSqlSession<any, any, any, any>;
		},
	) {
		super(MsSqlCountBuilder.buildCount(countConfig.source, countConfig.filters, true).queryChunks);
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
			this.executableSql = MsSqlCountBuilder.buildCount(source, filters);
		}

		return this.dialect.sqlToQuery(this.executableSql);
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return this.session.prepareQuery<
			PreparedQueryConfig & { execute: number },
			PreparedQueryHKTBase
		>(
			this.build(),
			'arrays',
			(rows: unknown[][]) => {
				const v = rows[0]?.[0] as number | string | undefined;
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues) as Promise<number>;
	}
}

applyMixins(MsSqlCountBuilder, [QueryPromise]);
