import { entityKind, is } from '~/entity.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '../session.ts';

/**
 * @internal
 * `prepare`, `run`, `all`, `get`, `values` and `execute` of every runtime's builders, mixed into them (`applyMixins`):
 * the common builders also serve the session-less `QueryBuilder`, so they can't have these themselves. They return
 * what the session's runtime runs (a value, a Promise or an Effect); each runtime's builder declares their types
 */
export abstract class SQLiteRunnableQuery {
	static readonly [entityKind]: string = 'SQLiteRunnableQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	protected abstract session: SQLiteSession<any, any> | undefined;

	abstract _prepare(prepare?: boolean): SQLitePreparedQuery;

	prepare(): unknown {
		return this._prepare(true);
	}

	run(placeholderValues?: Record<string, unknown>): unknown {
		return this.session!.runtime.span('drizzle.operation', undefined, () => this._prepare().run(placeholderValues));
	}

	all(placeholderValues?: Record<string, unknown>): unknown {
		return this.session!.runtime.span('drizzle.operation', undefined, () => this._prepare().all(placeholderValues));
	}

	get(placeholderValues?: Record<string, unknown>): unknown {
		return this.session!.runtime.span('drizzle.operation', undefined, () => this._prepare().get(placeholderValues));
	}

	values(placeholderValues?: Record<string, unknown>): unknown {
		return this.session!.runtime.span(
			'drizzle.operation',
			undefined,
			() => this._prepare().values(placeholderValues),
		);
	}

	execute(placeholderValues?: Record<string, unknown>): unknown {
		return this.session!.runtime.span(
			'drizzle.operation',
			undefined,
			() => this._prepare().execute(placeholderValues),
		);
	}
}

/**
 * `run`, `all`, `get` and `values` of every runtime's builders (implemented by {@link SQLiteRunnableQuery}): typed
 * from what the builder's own `prepare()` returns, so each builder only declares `prepare`
 */
export interface SQLiteRunnableMethods {
	prepare(): { run: unknown; all: unknown; get: unknown; values: unknown; execute: unknown };

	run: ReturnType<this['prepare']>['run'];

	all: ReturnType<this['prepare']>['all'];

	get: ReturnType<this['prepare']>['get'];

	values: ReturnType<this['prepare']>['values'];
}

/** {@link SQLiteRunnableMethods} of the Effect runtime's builders, with `execute` typed the same way */
export interface SQLiteEffectRunnableMethods extends SQLiteRunnableMethods {
	execute: ReturnType<this['prepare']>['execute'];
}
