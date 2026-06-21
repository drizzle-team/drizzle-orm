import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import type { MySqlDialect } from '../dialect.ts';
import { MySqlCountBuilder } from '../query-builders/count.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';
import type { MySqlAsyncSession } from './session.ts';

export interface MySqlAsyncCountBuilder extends MySqlCountBuilder, QueryPromise<number> {}

export class MySqlAsyncCountBuilder extends MySqlCountBuilder {
	static override readonly [entityKind]: string = 'MySqlAsyncCountBuilder';

	protected session: MySqlAsyncSession;

	constructor(
		{ source, dialect, filters, session }: {
			source: MySqlTable | MySqlViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: MySqlDialect;
			session: MySqlAsyncSession;
		},
	) {
		super({ source, dialect, filters });
		this.session = session;
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<number> {
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

applyMixins(MySqlAsyncCountBuilder, [QueryPromise]);
