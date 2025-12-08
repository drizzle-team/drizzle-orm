import type { PgClient } from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';
import type { EffectWrapper } from '~/effect-core/effectable.ts';
import { applyEffectWrapper } from '~/effect-core/effectable.ts';
import type { EffectPgSession } from '~/effect-postgres/session.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';

export interface EffectPgCountBuilder<
	// oxlint-disable-next-line no-unused-vars
	TSession extends EffectPgSession<any, any, any>,
> extends EffectWrapper<number, DrizzleQueryError, PgClient> {
}

export class EffectPgCountBuilder<
	TSession extends EffectPgSession<any, any, any>,
> extends SQL<number> implements SQLWrapper<number>, EffectWrapper<number, DrizzleQueryError, PgClient> {
	private sql: SQL<number>;
	static override readonly [entityKind]: string = 'EffectPgCountBuilder';
	[Symbol.toStringTag] = 'EffectPgCountBuilder';

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
		super(EffectPgCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.mapWith(Number);

		this.session = params.session;
		this.dialect = params.dialect;

		this.sql = EffectPgCountBuilder.buildCount(
			params.source,
			params.filters,
		);
	}

	execute(): Effect.Effect<number, DrizzleQueryError, PgClient> {
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
}

applyEffectWrapper(EffectPgCountBuilder);
