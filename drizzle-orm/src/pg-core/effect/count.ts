import { Effect } from 'effect';
import type { EffectPgSession } from '~/effect-postgres/session.ts';
import { entityKind } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { NeonAuthToken } from '~/utils.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';

export class PgEffectCountBuilder<
	TSession extends EffectPgSession<any, any, any>,
> extends SQL<number> implements SQLWrapper<number> {
	private sql: SQL<number>;
	private token?: NeonAuthToken;

	static override readonly [entityKind]: string = 'PgEffectCountBuilder';
	[Symbol.toStringTag] = 'PgEffectCountBuilder';

	private session: TSession;

	private static buildEmbeddedCount(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		const where = filters ? sql` where ${filters}` : sql.empty();
		return sql<number>`(select count(*) from ${source}${where})`;
	}

	private static buildCount(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`select count(*) as count from ${source}${sql.raw(' where ').if(filters)}${filters};`;
	}

	constructor(
		readonly params: {
			source: PgTable | PgViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			session: TSession;
		},
	) {
		super(PgEffectCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.mapWith(Number);

		this.session = params.session;

		this.sql = PgEffectCountBuilder.buildCount(
			params.source,
			params.filters,
		);
	}

	/** @intrnal */
	setToken(token?: NeonAuthToken) {
		this.token = token;
		return this;
	}

	// TODO: neon token
	private toEffect(): Effect.Effect<any[], Error, never> {
		// TODO:[0]["count"]
		return this.session.all(this.sql);
	}

	get [Effect.EffectTypeId]() {
		return this.toEffect()[Effect.EffectTypeId];
	}

	[Symbol.iterator]() {
		return this.toEffect()[Symbol.iterator]();
	}

	pipe(...args: any[]) {
		return (this.toEffect() as any).pipe(...args);
	}
}
