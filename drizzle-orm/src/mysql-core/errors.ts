import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';

/**
 * MySQL server error numbers (`errno`), as reported by `mysql2`/`mysql` drivers
 * and compatible databases such as SingleStore and MariaDB.
 *
 * @example `MYSQL_ERROR.DUP_ENTRY === 1062`
 */
export const MYSQL_ERROR = {
	CON_COUNT_ERROR: 1040,
	OUT_OF_RESOURCES: 1041,
	BAD_HOST_ERROR: 1042,
	DBACCESS_DENIED_ERROR: 1044,
	ACCESS_DENIED_ERROR: 1045,
	NO_DB_ERROR: 1046,
	UNKNOWN_COM_ERROR: 1047,
	BAD_NULL_ERROR: 1048,
	BAD_DB_ERROR: 1049,
	TABLE_EXISTS_ERROR: 1050,
	BAD_TABLE_ERROR: 1051,
	NON_UNIQ_ERROR: 1052,
	SERVER_SHUTDOWN: 1053,
	BAD_FIELD_ERROR: 1054,
	WRONG_VALUE_COUNT: 1058,
	TOO_LONG_IDENT: 1059,
	DUP_FIELDNAME: 1060,
	DUP_KEYNAME: 1061,
	DUP_ENTRY: 1062,
	PARSE_ERROR: 1064,
	INVALID_DEFAULT: 1067,
	MULTIPLE_PRI_KEY: 1068,
	TOO_MANY_KEYS: 1069,
	TOO_MANY_KEY_PARTS: 1070,
	TOO_LONG_KEY: 1071,
	KEY_COLUMN_DOES_NOT_EXITS: 1072,
	NO_SUCH_INDEX: 1082,
	CANT_DROP_FIELD_OR_KEY: 1091,
	NO_SUCH_THREAD: 1094,
	KILL_DENIED_ERROR: 1095,
	UNKNOWN_ERROR: 1105,
	WRONG_VALUE_COUNT_ON_ROW: 1136,
	NO_SUCH_TABLE: 1146,
	LOCK_OR_ACTIVE_TRANSACTION: 1192,
	UNKNOWN_SYSTEM_VARIABLE: 1193,
	LOCK_WAIT_TIMEOUT: 1205,
	NO_PERMISSION_TO_CREATE_USER: 1211,
	LOCK_DEADLOCK: 1213,
	NO_REFERENCED_ROW: 1216,
	ROW_IS_REFERENCED: 1217,
	USER_LIMIT_REACHED: 1226,
	SPECIFIC_ACCESS_DENIED_ERROR: 1227,
	LOCAL_VARIABLE: 1228,
	GLOBAL_VARIABLE: 1229,
	WRONG_VALUE_FOR_VAR: 1231,
	INCORRECT_GLOBAL_LOCAL_VAR: 1238,
	CUT_VALUE_GROUP_CONCAT: 1260,
	VARIABLE_IS_NOT_STRUCT: 1272,
	TRUNCATED_WRONG_VALUE: 1292,
	SP_ALREADY_EXISTS: 1304,
	SP_DOES_NOT_EXIST: 1305,
	QUERY_INTERRUPTED: 1317,
	TRG_ALREADY_EXISTS: 1359,
	TRG_DOES_NOT_EXIST: 1360,
	TRG_ON_VIEW_OR_TEMP_TABLE: 1361,
	NO_DEFAULT_FOR_FIELD: 1364,
	TRUNCATED_WRONG_VALUE_FOR_FIELD: 1366,
	VIEW_CHECK_FAILED: 1369,
	DATA_TOO_LONG: 1406,
	QUERY_ON_FOREIGN_DATA_SOURCE: 1430,
	NO_SUCH_USER: 1449,
	ROW_IS_REFERENCED_2: 1451,
	NO_REFERENCED_ROW_2: 1452,
	NON_INSERTABLE_TABLE: 1471,
	DUP_ENTRY_AUTOINCREMENT_CASE: 1569,
	DUP_ENTRY_WITH_KEY_NAME: 1586,
	DUP_SIGNAL_SET: 1641,
	SIGNAL_WARN: 1642,
	RESIGNAL_WITHOUT_ACTIVE_HANDLER: 1645,
	SIGNAL_BAD_CONDITION_TYPE: 1646,
	DATA_OUT_OF_RANGE: 1690,
	FK_CANNOT_OPEN_PARENT: 1824,
	FK_INCORRECT_OPTION: 1825,
	FK_DUP_NAME: 1826,
	FK_CANNOT_DROP_PARENT: 3730,
	FK_INCOMPATIBLE_COLUMNS: 3780,
	CHECK_CONSTRAINT_VIOLATED: 3819,
	/** MariaDB `ER_CONSTRAINT_FAILED`. */
	CONSTRAINT_FAILED: 4025,
} as const;

export type MySqlConstraintType = 'unique' | 'not_null' | 'foreign_key' | 'check';

const mySqlConstraintTypes: Record<number, MySqlConstraintType> = {
	[MYSQL_ERROR.DUP_ENTRY]: 'unique',
	[MYSQL_ERROR.DUP_ENTRY_WITH_KEY_NAME]: 'unique',
	[MYSQL_ERROR.DUP_ENTRY_AUTOINCREMENT_CASE]: 'unique',
	[MYSQL_ERROR.BAD_NULL_ERROR]: 'not_null',
	[MYSQL_ERROR.NO_REFERENCED_ROW]: 'foreign_key',
	[MYSQL_ERROR.NO_REFERENCED_ROW_2]: 'foreign_key',
	[MYSQL_ERROR.ROW_IS_REFERENCED]: 'foreign_key',
	[MYSQL_ERROR.ROW_IS_REFERENCED_2]: 'foreign_key',
	[MYSQL_ERROR.CHECK_CONSTRAINT_VIOLATED]: 'check',
	// MariaDB reports most failed constraints as ER_CONSTRAINT_FAILED (4025)
	[MYSQL_ERROR.CONSTRAINT_FAILED]: 'check',
};

interface MySqlDriverError extends Error {
	code?: string;
	errno?: number;
	sqlState?: string;
	sqlStateMarker?: string;
	sqlMessage?: string;
	fatal?: boolean;
}

/**
 * `DrizzleQueryError` carrying the MySQL-compatible error report surfaced by
 * `mysql2`/`mysql` drivers (also used for SingleStore and MariaDB).
 *
 * The original driver error is preserved on {@link DrizzleQueryError.cause}.
 *
 * @example
 * ```ts
 * import { is } from 'drizzle-orm';
 * import { MYSQL_ERROR, MySqlQueryError } from 'drizzle-orm/mysql-core';
 *
 * try {
 * 	await db.insert(users).values({ email });
 * } catch (e) {
 * 	if (is(e, MySqlQueryError) && e.errno === MYSQL_ERROR.DUP_ENTRY) {
 * 		// e.constraintName, e.columnNames, ...
 * 	}
 * }
 * ```
 */
export class MySqlQueryError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'MySqlQueryError';

	/** Symbolic error name, e.g. `'ER_DUP_ENTRY'`. */
	readonly code?: string;
	/** Server error number, e.g. `1062`. Compare against {@link MYSQL_ERROR}. */
	readonly errno?: number;
	readonly sqlState?: string;
	readonly sqlMessage?: string;
	readonly fatal?: boolean;

	/**
	 * The kind of integrity constraint that was violated, when {@link errno}
	 * is a known constraint error number. `undefined` for any other error.
	 */
	readonly constraintType?: MySqlConstraintType;

	/** Constraint or index name extracted from {@link sqlMessage}, when reported. */
	readonly constraintName?: string;
	/** Table name extracted from {@link sqlMessage}, when reported. */
	readonly tableName?: string;
	/**
	 * Column names extracted from {@link sqlMessage}, when reported
	 * (e.g. `Column 'x' cannot be null`, `for key 't.col'`).
	 */
	readonly columnNames: string[];

	constructor(query: string, params: any[], cause: MySqlDriverError) {
		super(query, params, cause);
		this.name = 'MySqlQueryError';
		Error.captureStackTrace(this, MySqlQueryError);

		this.code = cause.code;
		this.errno = cause.errno;
		this.sqlState = cause.sqlState;
		this.sqlMessage = cause.sqlMessage;
		this.fatal = cause.fatal;
		this.constraintType = cause.errno === undefined ? undefined : mySqlConstraintTypes[cause.errno];

		const parsed = parseMySqlMessage(cause.sqlMessage ?? cause.message);
		this.constraintName = parsed.constraintName;
		this.tableName = parsed.tableName;
		this.columnNames = parsed.columnNames;
	}
}

/** @internal */
export function isMySqlDriverError(error: unknown): error is MySqlDriverError {
	if (typeof error !== 'object' || error === null) {
		return false;
	}
	const { code, errno, sqlMessage } = error as MySqlDriverError;
	return typeof code === 'string' && (typeof errno === 'number' || typeof sqlMessage === 'string');
}

/** @internal */
export function wrapMySqlQueryError(query: string, params: any[], error: unknown): DrizzleQueryError {
	return isMySqlDriverError(error)
		? new MySqlQueryError(query, params, error)
		: new DrizzleQueryError(query, params, error as Error);
}

// mysqljs/mysql2 report a human-readable `sqlMessage` (which drivers without
// `sqlMessage` still expose via `message`). Common shapes:
//   "Duplicate entry 'v' for key 'users.email'"
//   "Column 'email' cannot be null"
//   "Cannot add or update a child row: a foreign key constraint fails
//    (`db`.`table`, CONSTRAINT `fk` FOREIGN KEY (`col`) REFERENCES `t2` (`c2`))"
//   "Check constraint 'chk' is violated."
//   "CONSTRAINT `fk` failed for `db`.`table`" (MariaDB)
function parseMySqlMessage(
	message: string | undefined,
): { constraintName?: string; tableName?: string; columnNames: string[] } {
	const result: { constraintName?: string; tableName?: string; columnNames: string[] } = {
		columnNames: [],
	};
	if (message === undefined) {
		return result;
	}

	let match = /for key ['`]([^'`]+)['`]/.exec(message);
	if (match !== null) {
		// key names may be qualified as `table.key` or `db.table.key`
		const parts = match[1]!.split('.');
		result.constraintName = parts.at(-1);
		if (parts.length > 1) {
			result.tableName = parts.at(-2);
		}
	}

	match = /Column ['`]([^'`]+)['`] cannot be null/.exec(message);
	if (match !== null) {
		result.columnNames.push(match[1]!);
	}

	// `db`.`table`, CONSTRAINT `fk` FOREIGN KEY (`col`)
	match = /CONSTRAINT ['`]([^'`]+)['`]/.exec(message);
	if (match !== null) {
		result.constraintName ??= match[1];
	}
	match = /Check constraint ['`]([^'`]+)['`]/.exec(message);
	if (match !== null) {
		result.constraintName ??= match[1];
	}

	match = /foreign key constraint fails \(`[^`]+`\.`([^`]+)`/.exec(message)
		?? /failed for `[^`]+`\.`([^`]+)`/.exec(message);
	if (match !== null) {
		result.tableName ??= match[1];
	}

	match = /FOREIGN KEY \(([^)]+)\)/.exec(message);
	if (match !== null) {
		result.columnNames.push(
			...match[1]!.split(',').map((col) => col.replaceAll('`', '').trim()),
		);
	}

	return result;
}
