import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export type ConstraintViolationKind = 'unique' | 'foreign_key' | 'not_null' | 'check' | 'other';

export class DrizzleConstraintError extends DrizzleError {
	static override readonly [entityKind]: string = 'DrizzleConstraintError';

	readonly kind: ConstraintViolationKind;
	readonly constraint?: string;
	readonly detail?: string;
	readonly table?: string;
	readonly column?: string;

	constructor({
		message,
		cause,
		kind = 'other',
		constraint,
		detail,
		table,
		column,
	}: {
		message?: string;
		cause?: unknown;
		kind?: ConstraintViolationKind;
		constraint?: string;
		detail?: string;
		table?: string;
		column?: string;
	}) {
		super({ message: message ?? `Database constraint violation (${kind})`, cause });
		this.name = 'DrizzleConstraintError';
		this.kind = kind;
		this.constraint = constraint;
		this.detail = detail;
		this.table = table;
		this.column = column;
	}
}

export class DrizzleUniqueConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleUniqueConstraintError';

	constructor(options: {
		message?: string;
		cause?: unknown;
		constraint?: string;
		detail?: string;
		table?: string;
		column?: string;
	}) {
		super({ ...options, kind: 'unique' });
		this.name = 'DrizzleUniqueConstraintError';
	}
}

export class DrizzleForeignKeyConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleForeignKeyConstraintError';

	constructor(options: {
		message?: string;
		cause?: unknown;
		constraint?: string;
		detail?: string;
		table?: string;
		column?: string;
	}) {
		super({ ...options, kind: 'foreign_key' });
		this.name = 'DrizzleForeignKeyConstraintError';
	}
}

export class DrizzleNotNullConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleNotNullConstraintError';

	constructor(options: {
		message?: string;
		cause?: unknown;
		constraint?: string;
		detail?: string;
		table?: string;
		column?: string;
	}) {
		super({ ...options, kind: 'not_null' });
		this.name = 'DrizzleNotNullConstraintError';
	}
}

export class DrizzleCheckConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleCheckConstraintError';

	constructor(options: {
		message?: string;
		cause?: unknown;
		constraint?: string;
		detail?: string;
		table?: string;
		column?: string;
	}) {
		super({ ...options, kind: 'check' });
		this.name = 'DrizzleCheckConstraintError';
	}
}

export class DrizzleQueryError extends Error {
	public code?: string;
	public constraint?: string;
	public table?: string;
	public column?: string;
	public detail?: string;
	public constraintType?: ConstraintViolationKind;

	constructor(
		public query: string,
		public params: any[],
		public override cause?: Error,
	) {
		super(`Failed query: ${query}\nparams: ${params}`);
		Error.captureStackTrace(this, DrizzleQueryError);

		if (cause) {
			(this as any).cause = cause;
			const err = cause as any;
			this.code = err.code ?? (typeof err.errno === 'number' ? String(err.errno) : undefined);
			this.constraint = err.constraint;
			this.table = err.table;
			this.column = err.column;
			this.detail = err.detail;

			const c = this.code;
			const msg = String(err.message || '');
			if (
				c === '23505'
				|| c === '1062'
				|| c === '2067'
				|| msg.includes('UNIQUE constraint failed')
				|| msg.includes('Duplicate entry')
			) {
				this.constraintType = 'unique';
			} else if (
				c === '23503'
				|| c === '1451'
				|| c === '1452'
				|| c === '787'
				|| msg.includes('FOREIGN KEY constraint failed')
			) {
				this.constraintType = 'foreign_key';
			} else if (
				c === '23502'
				|| c === '1048'
				|| c === '1299'
				|| msg.includes('NOT NULL constraint failed')
			) {
				this.constraintType = 'not_null';
			} else if (
				c === '23514'
				|| c === '3819'
				|| c === '275'
				|| msg.includes('CHECK constraint failed')
			) {
				this.constraintType = 'check';
			} else if (c?.startsWith('23') || c?.includes('CONSTRAINT') || msg.toLowerCase().includes('constraint')) {
				this.constraintType = 'other';
			}
		}
	}

	toConstraintError(): DrizzleConstraintError | undefined {
		if (!this.constraintType) return undefined;
		const opts = {
			message: this.message,
			cause: this.cause,
			constraint: this.constraint,
			detail: this.detail,
			table: this.table,
			column: this.column,
		};
		switch (this.constraintType) {
			case 'unique':
				return new DrizzleUniqueConstraintError(opts);
			case 'foreign_key':
				return new DrizzleForeignKeyConstraintError(opts);
			case 'not_null':
				return new DrizzleNotNullConstraintError(opts);
			case 'check':
				return new DrizzleCheckConstraintError(opts);
			default:
				return new DrizzleConstraintError({ ...opts, kind: this.constraintType });
		}
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
