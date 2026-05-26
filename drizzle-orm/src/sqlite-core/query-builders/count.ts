import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query } from '~/sql/sql.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { ExecuteResultSync, SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';
import type { SQLiteViewBase } from '../view-base.ts';

export type SQLiteCountBuilderKind<TMode extends 'sync' | 'async'> = TMode extends 'async' ? SQLiteCountBuilder
	: SQLiteSyncCountBuilder;

// oxlint-disable-next-line no-unused-vars
export interface SQLiteCountBuilder extends SQL<number>, SQLWrapper<number>, QueryPromise<number> {}

export class SQLiteCountBuilder extends SQL<number> implements SQLWrapper<number> {
	static override readonly [entityKind]: string = 'SQLiteCountBuilder';

	protected dialect: SQLiteDialect;
	protected session: SQLiteSession<any, any, any, any, any>;

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
			session: SQLiteSession<any, any, any, any, any>;
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
	executeRaw(placeholderValues?: Record<string, unknown>): Promise<number> | ExecuteResultSync<number> {
		return this.session.prepareOneTimeQuery(
			this.build(),
			undefined,
			'all',
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues) as any;
	}

	// async-await to avoid crashing when used on sync drivers with .then(), .catch() for compatibility
	async execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return await (this.executeRaw(placeholderValues));
	}
}

export class SQLiteSyncCountBuilder extends SQLiteCountBuilder {
	static override readonly [entityKind]: string = 'SQLiteSyncCountBuilder';

	sync(placeholderValues?: Record<string, unknown>): number {
		return (this.executeRaw(placeholderValues) as ExecuteResultSync<number>).sync();
	}
}

applyMixins(SQLiteCountBuilder, [QueryPromise]);
