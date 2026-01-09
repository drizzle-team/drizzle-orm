import { TaggedError } from 'effect/Data';
import { entityKind } from '~/entity.ts';

export class TaggedDrizzleError extends TaggedError('DrizzleError') {
	static readonly [entityKind]: string = 'TaggedDrizzleError';

	override readonly message: string;
	override readonly cause?: unknown;

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super();
		this.name = 'TaggedDrizzleError';
		this.message = message ?? '';
		this.cause = cause;
	}
}

export class TaggedDrizzleQueryError extends TaggedError('DrizzleQueryError') {
	static readonly [entityKind]: string = 'TaggedDrizzleQueryError';

	override readonly message: string;

	constructor(
		public readonly query: string,
		public readonly params: any[],
		public override cause?: Error,
	) {
		super();
		this.message = `Failed query: ${query}\nparams: ${params}`;
		Error.captureStackTrace(this, TaggedDrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

export class TaggedTransactionRollbackError extends TaggedError('TransactionRollbackError') {
	static readonly [entityKind]: string = 'TaggedTransactionRollbackError';

	override readonly message = 'Rollback';
}
