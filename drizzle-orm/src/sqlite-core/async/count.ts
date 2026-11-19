import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { ExecuteResultSync } from '~/sqlite-core/async/session.ts';
import { SQLiteCountBuilder } from '~/sqlite-core/query-builders/count.ts';
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

	/** @internal The count as the driver gives it: a Promise from async drivers, an `ExecuteResultSync` from sync ones */
	executeRaw(placeholderValues?: Record<string, unknown>): Promise<number> | ExecuteResultSync<number> {
		return this._prepare().execute(placeholderValues) as Promise<number> | ExecuteResultSync<number>;
	}

	override async execute(placeholderValues?: Record<string, unknown>): Promise<number> {
		return await this.executeRaw(placeholderValues);
	}
}

applyMixins(SQLiteAsyncCountBuilder, [QueryPromise]);

export class SQLiteSyncCountBuilder extends SQLiteAsyncCountBuilder {
	static override readonly [entityKind]: string = 'SQLiteSyncCountBuilder';

	sync(placeholderValues?: Record<string, unknown>): number {
		return (this.executeRaw(placeholderValues) as ExecuteResultSync<number>).sync();
	}
}
