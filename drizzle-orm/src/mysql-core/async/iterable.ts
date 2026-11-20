import { entityKind, is } from '~/entity.ts';
import type { MySqlAsyncPreparedQuery } from './session.ts';

/**
 * @internal
 * `iterator` of the async runtime's builders, mixed into them (`applyMixins`) next to `QueryPromise`: Effect builders
 * have no iterator
 */
export abstract class MySqlAsyncIterableQuery {
	static readonly [entityKind]: string = 'MySqlAsyncIterableQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	abstract _prepare(): unknown;

	async *iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<unknown> {
		yield* (this._prepare() as MySqlAsyncPreparedQuery<any>).iterator(placeholderValues);
	}
}
