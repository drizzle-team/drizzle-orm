import * as Schema from 'effect/Schema';
import { entityKind } from '~/entity.ts';

export class EffectDrizzleError extends Schema.TaggedError<EffectDrizzleError>()('EffectDrizzleError', {
	message: Schema.String,
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = this._tag;
}

export class EffectDrizzleQueryError extends Schema.TaggedError<EffectDrizzleQueryError>()('EffectDrizzleQueryError', {
	query: Schema.String,
	params: Schema.Array(Schema.Any).pipe(Schema.mutable),
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = this._tag;

	override get message() {
		return `Failed query: ${this.query}\nparams: ${this.params}`;
	}

	constructor(params: Omit<Schema.Struct.Constructor<typeof EffectDrizzleQueryError.fields>, '_tag'>) {
		super(params);
		Error.captureStackTrace(this, EffectDrizzleQueryError);
	}
}

export class EffectTransactionRollbackError
	extends Schema.TaggedError<EffectTransactionRollbackError>()('EffectTransactionRollbackError', {})
{
	static readonly [entityKind]: string = this._tag;

	override readonly message = 'Rollback';
}

export class MigratorInitError extends Schema.TaggedError<MigratorInitError>()('MigratorInitError', {
	exitCode: Schema.Literal('databaseMigrations', 'localMigrations'),
}) {
	static readonly [entityKind]: string = this._tag;
}
