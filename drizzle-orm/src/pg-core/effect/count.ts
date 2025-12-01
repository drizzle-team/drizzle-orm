import type { PgClient } from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';
import type { EffectPgSession } from '~/effect-postgres/session.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';

export class PgEffectCountBuilder<
	TSession extends EffectPgSession<any, any, any>,
> extends SQL<number> implements SQLWrapper<number> {
	private sql: SQL<number>;
	static override readonly [entityKind]: string = 'PgEffectCountBuilder';
	[Symbol.toStringTag] = 'PgEffectCountBuilder';

	private session: TSession;
	private dialect: PgDialect;

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
			dialect: PgDialect;
		},
	) {
		super(PgEffectCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.mapWith(Number);

		this.session = params.session;
		this.dialect = params.dialect;

		this.sql = PgEffectCountBuilder.buildCount(
			params.source,
			params.filters,
		);
	}

	private toEffect(): Effect.Effect<number, DrizzleQueryError, PgClient> {
		const query = this.dialect.sqlToQuery(this.sql);
		return this.session.prepareQuery<{
			execute: number;
			all: unknown;
			values: unknown;
		}>(
			query,
			undefined,
			undefined,
			false,
			(rows) => Number(rows[0]?.[0] ?? 0),
		).execute().pipe(Effect.catchAll((e) => Effect.fail(new DrizzleQueryError(query.sql, query.params, e))));
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
