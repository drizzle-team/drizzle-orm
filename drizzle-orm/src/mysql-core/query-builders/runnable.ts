import { entityKind, is } from '~/entity.ts';

export abstract class MySqlRunnableQuery {
	static readonly [entityKind]: string = 'MySqlRunnableQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	abstract _prepare(): { execute(placeholderValues?: Record<string, unknown>): unknown };

	prepare(): unknown {
		return this._prepare();
	}

	execute(placeholderValues?: Record<string, unknown>): unknown {
		return this._prepare().execute(placeholderValues);
	}
}
