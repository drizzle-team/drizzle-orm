import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query } from '~/sql/sql.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import type { MsSqlDialect } from '../dialect.ts';
import type { MsSqlSession, PreparedQueryHKTBase } from '../session.ts';
import type { MsSqlTable } from '../table.ts';
import type { MsSqlViewBase } from '../view-base.ts';

// oxlint-disable-next-line no-unused-vars
export interface MsSqlCountBuilder<TPreparedQueryHKT extends PreparedQueryHKTBase>
	extends SQL<number>, SQLWrapper<number>, QueryPromise<number>
{}

export class MsSqlCountBuilder<TPreparedQueryHKT extends PreparedQueryHKTBase> extends SQL<number>
	implements SQLWrapper<number>
{
	static override readonly [entityKind]: string = 'MsSqlCountBuilder';

	protected dialect: MsSqlDialect;
	protected session: MsSqlSession<any, TPreparedQueryHKT, any, any, any>;

	private static buildEmbeddedCount(
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
			session: MsSqlSession<any, TPreparedQueryHKT, any, any, any>;
		},
	) {
		super(MsSqlCountBuilder.buildEmbeddedCount(countConfig.source, countConfig.filters, true).queryChunks);
		this.dialect = countConfig.dialect;
		this.session = countConfig.session;
		this.mapWith((e) => {
			if (typeof e === 'number') return e;

			return Number(e ?? 0);
		});
	}

	protected build(): Query {
		const { filters, source } = this.countConfig;
		const query = MsSqlCountBuilder.buildEmbeddedCount(source, filters);

		return this.dialect.sqlToQuery(query);
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return this.session.prepareQuery<
			{
				execute: number;
				iterator: never;
			},
			TPreparedQueryHKT
		>(
			this.build(),
			undefined,
			(rows) => {
				const value = rows[0]?.[0];
				if (typeof value === 'number') return value;
				return value ? Number(value) : 0;
			},
		).execute(placeholderValues) as Promise<number>;
	}
}

applyMixins(MsSqlCountBuilder, [QueryPromise]);
