// Helpers that the Effect clients share: transaction settings as SQL, the SQLSTATE table that turns a PgError into
// one of Effect's SqlError reasons, `toSqlError` and the statement compiler. No client's connection code is loaded
// here, so the Aurora and HTTP clients don't load the wire protocol.
import {
	AuthenticationError,
	AuthorizationError,
	ConnectionError,
	ConstraintError,
	DeadlockError,
	LockTimeoutError,
	SerializationError,
	SqlError,
	SqlSyntaxError,
	StatementTimeoutError,
	UniqueViolation,
	UnknownError,
} from 'effect/sql/SqlError';
import type { Custom } from 'effect/sql/Statement';
import * as Statement from 'effect/sql/Statement';
import { isConnectionLost as isConnectionLostError, PgError } from '../errors.ts';

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

export const toSqlError = (cause: unknown, operation: string, conn?: { readonly state: string }) => {
	const isConnectionLost = (conn !== undefined && conn.state !== 'ready') || isConnectionLostError(cause);
	const message = cause instanceof Error ? cause.message : String(cause);
	if (cause instanceof PgError && !isConnectionLost) {
		if (cause.code === '42601' && /multiple commands/.test(message)) {
			return new SqlError({
				reason: new SqlSyntaxError({
					cause,
					message:
						'SQL with several statements is not supported: Drizzle Postgres sends each query as one statement. Run the statements one by one.',
					operation,
				}),
			});
		}
		return new SqlError({ reason: classifySqlState(cause.code, cause.constraint, { cause, message, operation }) });
	}
	const props = { cause, message, operation };
	if (isConnectionLost || conn === undefined) return new SqlError({ reason: new ConnectionError(props) });
	return new SqlError({ reason: new UnknownError(props) });
};

/** The Postgres statement compiler: $n placeholders, double-quoted identifiers, and json fragments as jsonb. */
export const makeCompiler = (transform?: (_: string) => string, transformJson = true) => {
	const transformValue = transformJson && transform ? Statement.defaultTransforms(transform).value : undefined;
	return Statement.makeCompiler<PostgresJson>({
		dialect: 'pg',
		placeholder: (i) => `$${i}`,
		onIdentifier: transform
			? (value, withoutTransform) => escape(withoutTransform ? value : transform(value))
			: escape,
		onRecordUpdate(placeholders, valueAlias, valueColumns, values, returning) {
			return [
				`(values ${placeholders}) AS ${valueAlias}${valueColumns}${returning ? ` RETURNING ${returning[0]}` : ''}`,
				returning ? values.flat().concat(returning[1]) : values.flat(),
			];
		},
		onCustom(type, placeholder, withoutTransform) {
			const value = withoutTransform || transformValue === undefined ? type.paramA : transformValue(type.paramA);
			return [`${placeholder(undefined)}::jsonb`, [JSON.stringify(value)]];
		},
	});
};

const escape = Statement.defaultEscape('"');

export interface PostgresJson extends Custom<'PostgresJson', unknown> {}
export const PostgresJson = Statement.custom<PostgresJson>('PostgresJson');
