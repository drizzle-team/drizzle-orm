import type { Effect } from 'effect/Effect';
import type { TaggedDrizzleQueryError } from '~/effect-core/errors.ts';
import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { PgDialect } from '../dialect.ts';
import { PgCountBuilder } from '../query-builders/count.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgEffectSession } from './session.ts';

export interface PgEffectCountBuilder extends PgCountBuilder, QueryEffect<number, TaggedDrizzleQueryError> {}

export class PgEffectCountBuilder extends PgCountBuilder {
	static override readonly [entityKind]: string = 'PgEffectCountBuilder';

	protected session: PgEffectSession;

	constructor(
		{ source, dialect, filters, session }: {
			source: PgTable | PgViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: PgDialect;
			session: PgEffectSession;
		},
	) {
		super({ source, dialect, filters });
		this.session = session;
	}

	execute(placeholderValues?: Record<string, unknown>): Effect<number, TaggedDrizzleQueryError> {
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
