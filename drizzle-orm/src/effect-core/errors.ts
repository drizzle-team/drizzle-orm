import * as Schema from 'effect/Schema';
import { entityKind, is } from '~/entity.ts';

export class EffectDrizzleError extends Schema.TaggedError<EffectDrizzleError>()('EffectDrizzleError', {
	message: Schema.String,
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = 'EffectDrizzleError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}
}

export class EffectDrizzleQueryError extends Schema.TaggedError<EffectDrizzleQueryError>()('EffectDrizzleQueryError', {
	query: Schema.String,
	params: Schema.UndefinedOr(Schema.Array(Schema.Any).pipe(Schema.mutable)),
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = 'EffectDrizzleQueryError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	override get message() {
		return this.params ? `Failed query: ${this.query}\nparams: ${this.params}` : `Failed query: ${this.query}`;
	}

	constructor(params: Omit<Schema.Struct.MakeIn<typeof EffectDrizzleQueryError.fields>, '_tag'>) {
		super(params);
		Error.captureStackTrace(this, EffectDrizzleQueryError);
	}
}

export class EffectTransactionRollbackError
	extends Schema.TaggedError<EffectTransactionRollbackError>()('EffectTransactionRollbackError', {})
{
	static readonly [entityKind]: string = 'EffectTransactionRollbackError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	override readonly message = 'Rollback';
}

export class MigratorInitError extends Schema.TaggedError<MigratorInitError>()('MigratorInitError', {
	exitCode: Schema.Literals(['databaseMigrations', 'localMigrations']),
}) {
	static readonly [entityKind]: string = 'MigratorInitError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}
}
