// Helpers that the Effect clients share: transaction settings as SQL, and the SQLSTATE table that turns a
// PgError into one of Effect's SqlError reasons.
import {
	AuthenticationError,
	AuthorizationError,
	ConnectionError,
	ConstraintError,
	DeadlockError,
	LockTimeoutError,
	SerializationError,
	SqlSyntaxError,
	StatementTimeoutError,
	UniqueViolation,
	UnknownError,
} from 'effect/sql/SqlError';

export interface TransactionOptions {
	readonly isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted' | undefined;
	readonly readOnly?: boolean | undefined;
	readonly deferrable?: boolean | undefined;
}

const ISOLATION_LEVELS = new Set(['serializable', 'repeatable read', 'read committed', 'read uncommitted']);

/** The `set transaction …` statement for `options`, or undefined when they set nothing. */
export const setTransaction = (options: TransactionOptions) => {
	const parts: string[] = [];
	if (options.isolation !== undefined) {
		if (!ISOLATION_LEVELS.has(options.isolation)) {
			throw new Error(
				`DrizzlePostgresClient: the isolation level "${options.isolation}" is unknown. Use serializable, repeatable read, read committed or read uncommitted.`,
			);
		}
		parts.push(`isolation level ${options.isolation}`);
	}
	if (options.readOnly !== undefined) parts.push(options.readOnly ? 'read only' : 'read write');
	if (options.deferrable !== undefined) parts.push(options.deferrable ? 'deferrable' : 'not deferrable');
	return parts.length ? 'set transaction ' + parts.join(' ') : undefined;
};

// The same SQLSTATE table as @effect/sql-pg.
export const classifySqlState = (
	code: string | undefined,
	constraint: unknown,
	props: { cause: unknown; message: string; operation: string },
) => {
	if (code !== undefined) {
		if (code.startsWith('08')) return new ConnectionError(props);
		if (code.startsWith('28')) return new AuthenticationError(props);
		if (code === '42501') return new AuthorizationError(props);
		if (code.startsWith('42')) return new SqlSyntaxError(props);
		if (code === '23505') {
			const name = typeof constraint === 'string' && constraint.trim() !== '' ? constraint.trim() : 'unknown';
			return new UniqueViolation({ ...props, constraint: name });
		}
		if (code.startsWith('23')) return new ConstraintError(props);
		if (code === '40P01') return new DeadlockError(props);
		if (code === '40001') return new SerializationError(props);
		if (code === '55P03') return new LockTimeoutError(props);
		if (code === '57014') return new StatementTimeoutError(props);
	}
	return new UnknownError(props);
};
