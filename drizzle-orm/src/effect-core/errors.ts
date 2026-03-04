import * as Schema from 'effect/Schema';
import { entityKind } from '~/entity.ts';

export class EffectDrizzleError extends Schema.TaggedErrorClass<EffectDrizzleError>()('EffectDrizzleError', {
	message: Schema.String,
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = 'EffectDrizzleError';
}

export class EffectDrizzleQueryError
	extends Schema.TaggedErrorClass<EffectDrizzleQueryError>()('EffectDrizzleQueryError', {
		query: Schema.String,
		params: Schema.Array(Schema.Any).pipe(Schema.mutable),
		cause: Schema.Unknown,
	})
{
	static readonly [entityKind]: string = 'EffectDrizzleQueryError';

	override get message() {
		const cause = this.cause;
		const causeMsg = cause !== null && typeof cause === 'object' && 'message' in cause
				&& typeof (cause as { message: unknown }).message === 'string'
			? `\nerror: ${(cause as { message: string }).message}`
			: '';
		return `Failed query: ${this.query}\nparams: ${this.params}${causeMsg}`;
	}

	constructor(params: Omit<Schema.Struct.MakeIn<typeof EffectDrizzleQueryError.fields>, '_tag'>) {
		super(params);
		Error.captureStackTrace(this, EffectDrizzleQueryError);
	}
}

export class EffectTransactionRollbackError
	extends Schema.TaggedErrorClass<EffectTransactionRollbackError>()('EffectTransactionRollbackError', {})
{
	static readonly [entityKind]: string = 'EffectTransactionRollbackError';

	override readonly message = 'Rollback';
}

export class MigratorInitError extends Schema.TaggedErrorClass<MigratorInitError>()('MigratorInitError', {
	exitCode: Schema.Literals(['databaseMigrations', 'localMigrations']),
}) {
	static readonly [entityKind]: string = 'MigratorInitError';
}
