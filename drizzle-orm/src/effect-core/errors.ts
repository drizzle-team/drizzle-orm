import * as Data from 'effect/Data';
import { entityKind } from '~/entity.ts';

export class TaggedDrizzleError extends Data.TaggedError('DrizzleError')<{
	readonly message?: string;
	readonly cause?: unknown;
}> {
	static readonly [entityKind]: string = 'TaggedDrizzleError';
}

export class TaggedDrizzleQueryError extends Data.TaggedError('DrizzleQueryError')<{
	readonly query: string;
	readonly params: ReadonlyArray<unknown>;
	readonly cause?: Error;
}> {
	static readonly [entityKind]: string = 'TaggedDrizzleQueryError';

	override get message(): string {
		return `Failed query: ${this.query}\nparams: ${this.params}`;
	}
}

export class TaggedTransactionRollbackError extends Data.TaggedError('TransactionRollbackError')<{}> {
	static readonly [entityKind]: string = 'TaggedTransactionRollbackError';

	override get message(): string {
		return 'Rollback';
	}
}
