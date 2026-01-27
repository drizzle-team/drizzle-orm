import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { PgDialect } from '../dialect.ts';
import { PgCountBuilder } from '../query-builders/count.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgEffectSession } from './session.ts';

export interface PgEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgCountBuilder, Effect.Effect<number, TEffectHKT['error'], TEffectHKT['context']>
{}

export class PgEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgCountBuilder {
	static override readonly [entityKind]: string = 'PgEffectCountBuilder';

	protected session: PgEffectSession<TEffectHKT, any, any, any, any>;

	constructor(
		{ source, dialect, filters, session }: {
			source: PgTable | PgViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: PgDialect;
			session: PgEffectSession<TEffectHKT, any, any, any, any>;
		},
	) {
		super({ source, dialect, filters });
		this.session = session;
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.session.prepareQuery<{
			execute: number;
			all: unknown;
			values: unknown;
		}>(
			this.build(),
			undefined,
			undefined,
			true,
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues);
	}
}

applyEffectWrapper(PgEffectCountBuilder);
