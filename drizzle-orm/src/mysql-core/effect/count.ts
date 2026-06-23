import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { MySqlDialect } from '../dialect.ts';
import { MySqlCountBuilder } from '../query-builders/count.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';
import type { MySqlEffectSession } from './session.ts';

export interface MySqlEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlCountBuilder, Effect.Effect<number, TEffectHKT['error'], TEffectHKT['context']>
{}

export class MySqlEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlCountBuilder
{
	static override readonly [entityKind]: string = 'MySqlEffectCountBuilder';

	protected session: MySqlEffectSession<TEffectHKT, any, any>;

	constructor(
		{ source, dialect, filters, session }: {
			source: MySqlTable | MySqlViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: MySqlDialect;
			session: MySqlEffectSession<TEffectHKT, any, any>;
		},
	) {
		super({ source, dialect, filters });
		this.session = session;
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.session.prepareQuery<{
			execute: number;
			iterator: never;
		}>(
			this.build(),
			'arrays',
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues);
	}
}

applyEffectWrapper(MySqlEffectCountBuilder);
