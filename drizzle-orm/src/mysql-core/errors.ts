import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';

/**
 * Common MySQL / SingleStore errno values for typed error handling.
 * @see https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
 */
export const MYSQL_ERROR = {
	DUP_ENTRY: 1062,
	BAD_NULL_ERROR: 1048,
	NO_REFERENCED_ROW: 1452,
	NO_REFERENCED_ROW_2: 1216,
	ROW_IS_REFERENCED: 1451,
	ROW_IS_REFERENCED_2: 1217,
	CHECK_CONSTRAINT_VIOLATED: 3819,
	DATA_TOO_LONG: 1406,
	TRUNCATED_WRONG_VALUE: 1292,
} as const;

export type MySqlErrorErrno = (typeof MYSQL_ERROR)[keyof typeof MYSQL_ERROR] | (number & {});

type DriverLike = {
	errno?: unknown;
	code?: unknown;
	sqlState?: unknown;
	sqlMessage?: unknown;
	message?: unknown;
	constraint?: unknown;
	table?: unknown;
	column?: unknown;
};

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractMySqlDriverFields(cause: unknown): DriverLike | undefined {
	if (!cause || typeof cause !== 'object') return undefined;
	const c = cause as DriverLike & { cause?: unknown };
	if (typeof c.errno === 'number' || typeof c.code === 'string') return c;
	if (c.cause && typeof c.cause === 'object') {
		const nested = c.cause as DriverLike;
		if (typeof nested.errno === 'number' || typeof nested.code === 'string') return nested;
	}
	return c;
}

/** Parse `Duplicate entry 'x' for key 'users.users_email_unique'` style messages. */
export function parseMySqlDuplicateMessage(message: string | undefined): {
	value?: string;
	constraint?: string;
} {
	if (!message) return {};
	const match = message.match(/Duplicate entry '([^']*)' for key '([^']+)'/i);
	if (!match) return {};
	return { value: match[1], constraint: match[2] };
}

/** Parse `Column 'email' cannot be null` style messages. */
export function parseMySqlNotNullMessage(message: string | undefined): { column?: string } {
	if (!message) return {};
	const match = message.match(/Column '([^']+)' cannot be null/i);
	return match ? { column: match[1] } : {};
}

/**
 * Dialect-native MySQL/SingleStore query error with errno + sqlState metadata.
 */
export class MySqlError extends DrizzleQueryError {
	static readonly [entityKind]: string = 'MySqlError';

	readonly errno: number;
	readonly sqlState?: string;
	readonly sqlMessage?: string;
	readonly table?: string;
	readonly column?: string;
	readonly constraint?: string;
	readonly duplicateValue?: string;

	constructor(
		query: string,
		params: any[],
		cause: Error | undefined,
		fields: {
			errno: number;
			sqlState?: string;
			sqlMessage?: string;
			table?: string;
			column?: string;
			constraint?: string;
			duplicateValue?: string;
		},
	) {
		super(query, params, cause);
		this.name = 'MySqlError';
		this.errno = fields.errno;
		this.sqlState = fields.sqlState;
		this.sqlMessage = fields.sqlMessage;
		this.table = fields.table;
		this.column = fields.column;
		this.constraint = fields.constraint;
		this.duplicateValue = fields.duplicateValue;
		Error.captureStackTrace?.(this, MySqlError);
	}
}

export function isMySqlError(error: unknown): error is MySqlError {
	return is(error, MySqlError);
}

export function isMySqlUniqueViolation(error: unknown): error is MySqlError {
	return isMySqlError(error) && error.errno === MYSQL_ERROR.DUP_ENTRY;
}

export function isMySqlNotNullViolation(error: unknown): error is MySqlError {
	return isMySqlError(error) && error.errno === MYSQL_ERROR.BAD_NULL_ERROR;
}

export function isMySqlForeignKeyViolation(error: unknown): error is MySqlError {
	return isMySqlError(error)
		&& (
			error.errno === MYSQL_ERROR.NO_REFERENCED_ROW
			|| error.errno === MYSQL_ERROR.NO_REFERENCED_ROW_2
			|| error.errno === MYSQL_ERROR.ROW_IS_REFERENCED
			|| error.errno === MYSQL_ERROR.ROW_IS_REFERENCED_2
		);
}

export function isMySqlCheckViolation(error: unknown): error is MySqlError {
	return isMySqlError(error) && error.errno === MYSQL_ERROR.CHECK_CONSTRAINT_VIOLATED;
}

export function wrapMySqlError(query: string, params: any[], cause: unknown): DrizzleQueryError {
	const err = cause instanceof Error ? cause : new Error(String(cause));
	const driver = extractMySqlDriverFields(cause);
	let errno = asNumber(driver?.errno);
	if (errno === undefined && typeof driver?.code === 'string') {
		const fromCode = Number(driver.code.replace(/^ER_/, ''));
		// mysql2 uses both numeric errno and string codes like ER_DUP_ENTRY
		if (driver.code === 'ER_DUP_ENTRY') errno = MYSQL_ERROR.DUP_ENTRY;
		else if (driver.code === 'ER_BAD_NULL_ERROR') errno = MYSQL_ERROR.BAD_NULL_ERROR;
		else if (driver.code === 'ER_NO_REFERENCED_ROW' || driver.code === 'ER_NO_REFERENCED_ROW_2') {
			errno = MYSQL_ERROR.NO_REFERENCED_ROW;
		} else if (driver.code === 'ER_ROW_IS_REFERENCED' || driver.code === 'ER_ROW_IS_REFERENCED_2') {
			errno = MYSQL_ERROR.ROW_IS_REFERENCED;
		} else if (driver.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
			errno = MYSQL_ERROR.CHECK_CONSTRAINT_VIOLATED;
		} else if (Number.isFinite(fromCode)) {
			errno = fromCode;
		}
	}
	if (errno === undefined) {
		return new DrizzleQueryError(query, params, err);
	}

	const sqlMessage = asString(driver?.sqlMessage) ?? asString(driver?.message);
	const dup = parseMySqlDuplicateMessage(sqlMessage);
	const nn = parseMySqlNotNullMessage(sqlMessage);

	return new MySqlError(query, params, err, {
		errno,
		sqlState: asString(driver?.sqlState),
		sqlMessage,
		table: asString(driver?.table),
		column: asString(driver?.column) ?? nn.column,
		constraint: asString(driver?.constraint) ?? dup.constraint,
		duplicateValue: dup.value,
	});
}
