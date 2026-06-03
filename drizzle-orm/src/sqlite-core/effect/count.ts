import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteCountBuilder } from '~/sqlite-core/query-builders/count.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { SQLiteViewBase } from '~/sqlite-core/view-base.ts';
import type { SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteCountBuilder, QueryEffectKind<TEffectHKT, number>
{}

export class SQLiteEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteCountBuilder
{
	static override readonly [entityKind]: string = 'SQLiteEffectCountBuilder';

	declare protected session: SQLiteEffectSession<any, TEffectHKT, any>;

	constructor(
		countConfig: {
			source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: SQLiteDialect;
			session: SQLiteEffectSession<any, TEffectHKT, any>;
		},
	) {
		super(countConfig);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.session.prepareQuery<{
			type: unknown;
			run: unknown;
			all: number;
			get: number;
			values: unknown;
			execute: number;
		}>(
			this.build(),
			'arrays',
			false,
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
