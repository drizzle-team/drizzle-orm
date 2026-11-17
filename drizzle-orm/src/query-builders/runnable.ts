import { entityKind, is } from '~/entity.ts';
import type { QueryRuntime } from '~/query-runtime.ts';

/**
 * @internal
 * `prepare` and `execute` of every runtime's builders, mixed into them (`applyMixins`): the common builders also
 * serve the session-less `QueryBuilder`, so they can't have these themselves. `execute` returns what the session's
 * runtime runs, a Promise or an Effect; each dialect types them through it's builders' runtime HKT
 */
export abstract class RunnableQueryMixin {
	static readonly [entityKind]: string = 'RunnableQueryMixin';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	protected abstract session: { readonly runtime: QueryRuntime } | undefined;

	abstract _prepare(
		name?: string,
		generateName?: boolean,
	): { execute(placeholderValues?: Record<string, unknown>): unknown };

	prepare(name?: string): unknown {
		return this._prepare(name, true);
	}

	execute(placeholderValues?: Record<string, unknown>): unknown {
		return this.session!.runtime.span(
			'drizzle.operation',
			undefined,
			() => this._prepare().execute(placeholderValues),
		);
	}
}
