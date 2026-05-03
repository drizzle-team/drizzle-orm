import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteTable } from '../table.ts';
import type { SQLiteView } from '../view.ts';
import type { SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQL<number>, SQLWrapper<number>, Effect.Effect<number, TEffectHKT['error'], TEffectHKT['context']>
{}

export class SQLiteEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends SQL<number> {
	static override readonly [entityKind]: string = 'SQLiteEffectCountBuilder';

	private sql: SQL<number>;
	private session: SQLiteEffectSession<TEffectHKT, any, any>;

	private static buildEmbeddedCount(
		source: SQLiteTable | SQLiteView | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`(select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters})`;
	}

	private static buildCount(
		source: SQLiteTable | SQLiteView | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters}`;
	}

	constructor(
		params: {
			source: SQLiteTable | SQLiteView | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			session: SQLiteEffectSession<TEffectHKT, any, any>;
		},
	) {
		super(SQLiteEffectCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.session = params.session;
		this.sql = SQLiteEffectCountBuilder.buildCount(params.source, params.filters);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.session.prepareQuery<{
			type: 'async';
			execute: number;
			run: unknown;
			all: unknown;
			get: unknown;
			values: unknown;
		}>(
			this.session.dialect.sqlToQuery(this.sql),
			undefined,
			'all',
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues);
	}
}

applyEffectWrapper(SQLiteEffectCountBuilder);
