import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import { applyMixins, type NeonAuthToken } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import { PgCountBuilder } from '../query-builders/count.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgAsyncSession } from './session.ts';

export interface PgAsyncCountBuilder extends PgCountBuilder, QueryPromise<number> {}

export class PgAsyncCountBuilder extends PgCountBuilder {
	static override readonly [entityKind]: string = 'PgAsyncCountBuilder';

	protected session: PgAsyncSession;

	constructor(
		{ source, dialect, filters, session }: {
			source: PgTable | PgViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: PgDialect;
			session: PgAsyncSession;
		},
	) {
		super({ source, dialect, filters });
		this.session = session;
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<number> {
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
		).setToken(this.authToken).execute(placeholderValues);
	}
}

applyMixins(PgAsyncCountBuilder, [QueryPromise]);
