import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { ExecuteResultSync } from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteCountBuilder } from '~/sqlite-core/query-builders/count.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { SQLiteViewBase } from '~/sqlite-core/view-base.ts';
import { applyMixins } from '~/utils.ts';
import type { SQLiteAsyncSession } from './session.ts';

export type SQLiteAsyncCountBuilderKind<TMode extends 'sync' | 'async'> = TMode extends 'async'
	? SQLiteAsyncCountBuilder
	: SQLiteSyncCountBuilder;

// oxlint-disable-next-line no-unused-vars
export interface SQLiteAsyncCountBuilder extends SQL<number>, SQLWrapper<number>, QueryPromise<number> {}

export class SQLiteAsyncCountBuilder extends SQLiteCountBuilder {
	static override readonly [entityKind]: string = 'SQLiteAsyncCountBuilder';

	declare protected session: SQLiteAsyncSession<any, any, any>;

	constructor(
		countConfig: {
			source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: SQLiteDialect;
			session: SQLiteAsyncSession<any, any, any>;
		},
	) {
		super(countConfig);
	}

	/** @internal */
	executeRaw(placeholderValues?: Record<string, unknown>): Promise<number> | ExecuteResultSync<number> {
		return this.session.prepareQuery(
			this.build(),
			'arrays',
			false,
			'all', // Do not use 'get' - mapper returns an item instead of an array, would break on session's destructuring; query itself is already aggregated into 1 item, so no performance overhead occurs.
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues) as any;
	}

	// async-await to avoid crashing when used on sync drivers with .then(), .catch() for compatibility
	async execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return await (this.executeRaw(placeholderValues));
	}
}

applyMixins(SQLiteAsyncCountBuilder, [QueryPromise]);

export class SQLiteSyncCountBuilder extends SQLiteAsyncCountBuilder {
	static override readonly [entityKind]: string = 'SQLiteSyncCountBuilder';

	sync(placeholderValues?: Record<string, unknown>): number {
		return (this.executeRaw(placeholderValues) as ExecuteResultSync<number>).sync();
	}
}
