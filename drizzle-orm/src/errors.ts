import { entityKind } from '~/entity.ts';

/**
 * Base error class for all Drizzle ORM errors.
 * Extend this class when creating custom Drizzle errors.
 *
 * @example
 * ```ts
 * try {
 *   await db.select().from(users);
 * } catch (error) {
 *   if (error instanceof DrizzleError) {
 *     console.error('Drizzle error:', error.message);
 *   }
 * }
 * ```
 */
export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

/**
 * Error thrown when a database query fails to execute.
 * Contains the original query and parameters for debugging.
 *
 * @example
 * ```ts
 * try {
 *   await db.execute(sql`SELECT * FROM users`);
 * } catch (error) {
 *   if (error instanceof DrizzleQueryError) {
 *     console.error('Query failed:', error.query);
 *     console.error('With params:', error.params);
 *   }
 * }
 * ```
 */
export class DrizzleQueryError extends Error {
	constructor(
		/** The SQL query string that failed */
		public query: string,
		/** The parameters that were passed to the query */
		public params: any[],
		/** The underlying error that caused the query to fail */
		public override cause?: Error,
	) {
		super(`Failed query: ${query}\nparams: ${params}`);
		Error.captureStackTrace(this, DrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

/**
 * Error thrown when a transaction is explicitly rolled back.
 * This is used for intentional rollbacks via `tx.rollback()`.
 *
 * @example
 * ```ts
 * await db.transaction(async (tx) => {
 *   await tx.insert(users).values({ name: 'John' });
 *   // Rollback the transaction
 *   tx.rollback();
 * });
 * ```
 */
export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
