import { entityKind, is } from '~/entity.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '../session.ts';

/**
 * @internal
 * `execute` of the async runtime's builders, mixed in after `SQLiteRunnableQuery`: it always resolves as a Promise,
 * also for sync drivers, whose prepared queries run as `ExecuteResultSync`
 */
export abstract class SQLiteAsyncRunnableQuery {
	static readonly [entityKind]: string = 'SQLiteAsyncRunnableQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	protected abstract session: SQLiteSession<any, any> | undefined;

	abstract _prepare(prepare?: boolean): SQLitePreparedQuery;

	async execute(placeholderValues?: Record<string, unknown>): Promise<unknown> {
		return this.session!.runtime.span(
			'drizzle.operation',
			undefined,
			() => this._prepare().execute(placeholderValues),
		);
	}
}
