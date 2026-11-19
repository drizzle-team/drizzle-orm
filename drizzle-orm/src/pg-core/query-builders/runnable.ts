import { entityKind, is } from '~/entity.ts';
import { type QueryRuntime, withSpan } from '~/runtime/core.ts';

export abstract class PgRunnableQuery {
	static readonly [entityKind]: string = 'PgRunnableQuery';
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
		return withSpan(
			this.session!.runtime,
			'drizzle.operation',
			undefined,
			() => this._prepare().execute(placeholderValues),
		);
	}
}
