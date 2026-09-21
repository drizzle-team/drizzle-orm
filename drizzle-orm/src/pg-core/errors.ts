import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';

/**
 * PostgreSQL SQLSTATE codes, grouped by class.
 *
 * `GENERIC` is the `...000` code reported when the server raises an error in a
 * class without a more specific condition.
 *
 * @example `PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.UNIQUE_VIOLATION === '23505'`
 */
export const PG_ERROR = {
	/** SQLSTATE class 00 */
	SUCCESSFUL_COMPLETION: {
		GENERIC: '00000',
	},
	/** SQLSTATE class 01 */
	WARNING: {
		GENERIC: '01000',
		DYNAMIC_RESULT_SETS_RETURNED: '0100C',
		IMPLICIT_ZERO_BIT_PADDING: '01008',
		NULL_VALUE_ELIMINATED_IN_SET_FUNCTION: '01003',
		PRIVILEGE_NOT_GRANTED: '01007',
		PRIVILEGE_NOT_REVOKED: '01006',
		STRING_DATA_RIGHT_TRUNCATION: '01004',
		DEPRECATED_FEATURE: '01P01',
	},
	/** SQLSTATE class 02 */
	NO_DATA: {
		GENERIC: '02000',
		NO_ADDITIONAL_DYNAMIC_RESULT_SETS_RETURNED: '02001',
	},
	/** SQLSTATE class 03 */
	SQL_STATEMENT_NOT_YET_COMPLETE: {
		GENERIC: '03000',
	},
	/** SQLSTATE class 08 */
	CONNECTION_EXCEPTION: {
		GENERIC: '08000',
		CONNECTION_DOES_NOT_EXIST: '08003',
		CONNECTION_FAILURE: '08006',
		SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION: '08001',
		SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION: '08004',
		TRANSACTION_RESOLUTION_UNKNOWN: '08007',
		PROTOCOL_VIOLATION: '08P01',
	},
	/** SQLSTATE class 09 */
	TRIGGERED_ACTION_EXCEPTION: {
		GENERIC: '09000',
	},
	/** SQLSTATE class 0A */
	FEATURE_NOT_SUPPORTED: {
		GENERIC: '0A000',
	},
	/** SQLSTATE class 0B */
	INVALID_TRANSACTION_INITIATION: {
		GENERIC: '0B000',
	},
	/** SQLSTATE class 0F */
	LOCATOR_EXCEPTION: {
		GENERIC: '0F000',
		INVALID_LOCATOR_SPECIFICATION: '0F001',
	},
	/** SQLSTATE class 0L */
	INVALID_GRANTOR: {
		GENERIC: '0L000',
		INVALID_GRANT_OPERATION: '0LP01',
	},
	/** SQLSTATE class 0P */
	INVALID_ROLE_SPECIFICATION: {
		GENERIC: '0P000',
	},
	/** SQLSTATE class 0Z */
	DIAGNOSTICS_EXCEPTION: {
		GENERIC: '0Z000',
		STACKED_DIAGNOSTICS_ACCESSED_WITHOUT_ACTIVE_HANDLER: '0Z002',
	},
	/** SQLSTATE class 10 */
	INVALID_ARGUMENT_FOR_XQUERY: {
		INVALID_ARGUMENT_FOR_XQUERY: '10608',
	},
	/** SQLSTATE class 20 */
	CASE_NOT_FOUND: {
		GENERIC: '20000',
	},
	/** SQLSTATE class 21 */
	CARDINALITY_VIOLATION: {
		GENERIC: '21000',
	},
	/** SQLSTATE class 22 */
	DATA_EXCEPTION: {
		GENERIC: '22000',
		ARRAY_SUBSCRIPT_ERROR: '2202E',
		CHARACTER_NOT_IN_REPERTOIRE: '22021',
		DATETIME_FIELD_OVERFLOW: '22008',
		DIVISION_BY_ZERO: '22012',
		ERROR_IN_ASSIGNMENT: '22005',
		ESCAPE_CHARACTER_CONFLICT: '2200B',
		INDICATOR_OVERFLOW: '22022',
		INTERVAL_FIELD_OVERFLOW: '22015',
		INVALID_ARGUMENT_FOR_LOGARITHM: '2201E',
		INVALID_ARGUMENT_FOR_NTILE_FUNCTION: '22014',
		INVALID_ARGUMENT_FOR_NTH_VALUE_FUNCTION: '22016',
		INVALID_ARGUMENT_FOR_POWER_FUNCTION: '2201F',
		INVALID_ARGUMENT_FOR_WIDTH_BUCKET_FUNCTION: '2201G',
		INVALID_CHARACTER_VALUE_FOR_CAST: '22018',
		INVALID_DATETIME_FORMAT: '22007',
		INVALID_ESCAPE_CHARACTER: '22019',
		INVALID_ESCAPE_OCTET: '2200D',
		INVALID_ESCAPE_SEQUENCE: '22025',
		NONSTANDARD_USE_OF_ESCAPE_CHARACTER: '22P06',
		INVALID_INDICATOR_PARAMETER_VALUE: '22010',
		INVALID_PARAMETER_VALUE: '22023',
		INVALID_PRECEDING_OR_FOLLOWING_SIZE: '22013',
		INVALID_REGULAR_EXPRESSION: '2201B',
		INVALID_ROW_COUNT_IN_LIMIT_CLAUSE: '2201W',
		INVALID_ROW_COUNT_IN_RESULT_OFFSET_CLAUSE: '2201X',
		INVALID_TABLESAMPLE_ARGUMENT: '2202H',
		INVALID_TABLESAMPLE_REPEAT: '2202G',
		INVALID_TIME_ZONE_DISPLACEMENT_VALUE: '22009',
		INVALID_USE_OF_ESCAPE_CHARACTER: '2200C',
		MOST_SPECIFIC_TYPE_MISMATCH: '2200G',
		NULL_VALUE_NOT_ALLOWED: '22004',
		NULL_VALUE_NO_INDICATOR_PARAMETER: '22002',
		NUMERIC_VALUE_OUT_OF_RANGE: '22003',
		SEQUENCE_GENERATOR_LIMIT_EXCEEDED: '2200H',
		STRING_DATA_LENGTH_MISMATCH: '22026',
		STRING_DATA_RIGHT_TRUNCATION: '22001',
		SUBSTRING_ERROR: '22011',
		TRIM_ERROR: '22027',
		UNTERMINATED_C_STRING: '22024',
		ZERO_LENGTH_CHARACTER_STRING: '2200F',
		FLOATING_POINT_EXCEPTION: '22P01',
		INVALID_TEXT_REPRESENTATION: '22P02',
		INVALID_BINARY_REPRESENTATION: '22P03',
		BAD_COPY_FILE_FORMAT: '22P04',
		UNTRANSLATABLE_CHARACTER: '22P05',
		NOT_AN_XML_DOCUMENT: '2200L',
		INVALID_XML_DOCUMENT: '2200M',
		INVALID_XML_CONTENT: '2200N',
		INVALID_XML_COMMENT: '2200S',
		INVALID_XML_PROCESSING_INSTRUCTION: '2200T',
		DUPLICATE_JSON_OBJECT_KEY_VALUE: '22030',
		INVALID_ARGUMENT_FOR_SQL_JSON_DATETIME_FUNCTION: '22031',
		INVALID_JSON_TEXT: '22032',
		INVALID_SQL_JSON_SUBSCRIPT: '22033',
		MORE_THAN_ONE_SQL_JSON_ITEM: '22034',
		NO_SQL_JSON_ITEM: '22035',
		NON_NUMERIC_SQL_JSON_ITEM: '22036',
		NON_UNIQUE_KEYS_IN_A_JSON_OBJECT: '22037',
		SINGLETON_SQL_JSON_ITEM_REQUIRED: '22038',
		SQL_JSON_ARRAY_NOT_FOUND: '22039',
		SQL_JSON_MEMBER_NOT_FOUND: '2203A',
		SQL_JSON_NUMBER_NOT_FOUND: '2203B',
		SQL_JSON_OBJECT_NOT_FOUND: '2203C',
		TOO_MANY_JSON_ARRAY_ELEMENTS: '2203D',
		TOO_MANY_JSON_OBJECT_MEMBERS: '2203E',
		SQL_JSON_SCALAR_REQUIRED: '2203F',
		SQL_JSON_ITEM_CANNOT_BE_CAST_TO_TARGET_TYPE: '2203G',
	},
	/** SQLSTATE class 23 */
	INTEGRITY_CONSTRAINT_VIOLATION: {
		GENERIC: '23000',
		RESTRICT_VIOLATION: '23001',
		NOT_NULL_VIOLATION: '23502',
		FOREIGN_KEY_VIOLATION: '23503',
		UNIQUE_VIOLATION: '23505',
		CHECK_VIOLATION: '23514',
		EXCLUSION_VIOLATION: '23P01',
	},
	/** SQLSTATE class 24 */
	INVALID_CURSOR_STATE: {
		GENERIC: '24000',
	},
	/** SQLSTATE class 25 */
	INVALID_TRANSACTION_STATE: {
		GENERIC: '25000',
		ACTIVE_SQL_TRANSACTION: '25001',
		BRANCH_TRANSACTION_ALREADY_ACTIVE: '25002',
		HELD_CURSOR_REQUIRES_SAME_ISOLATION_LEVEL: '25008',
		INAPPROPRIATE_ACCESS_MODE_FOR_BRANCH_TRANSACTION: '25003',
		INAPPROPRIATE_ISOLATION_LEVEL_FOR_BRANCH_TRANSACTION: '25004',
		NO_ACTIVE_SQL_TRANSACTION_FOR_BRANCH_TRANSACTION: '25005',
		READ_ONLY_SQL_TRANSACTION: '25006',
		SCHEMA_AND_DATA_STATEMENT_MIXING_NOT_SUPPORTED: '25007',
		NO_ACTIVE_SQL_TRANSACTION: '25P01',
		IN_FAILED_SQL_TRANSACTION: '25P02',
		IDLE_IN_TRANSACTION_SESSION_TIMEOUT: '25P03',
		TRANSACTION_TIMEOUT: '25P04',
	},
	/** SQLSTATE class 26 */
	INVALID_SQL_STATEMENT_NAME: {
		GENERIC: '26000',
	},
	/** SQLSTATE class 27 */
	TRIGGERED_DATA_CHANGE_VIOLATION: {
		GENERIC: '27000',
	},
	/** SQLSTATE class 28 */
	INVALID_AUTHORIZATION_SPECIFICATION: {
		GENERIC: '28000',
		INVALID_PASSWORD: '28P01',
	},
	/** SQLSTATE class 2B */
	DEPENDENT_PRIVILEGE_DESCRIPTORS_STILL_EXIST: {
		GENERIC: '2B000',
		DEPENDENT_OBJECTS_STILL_EXIST: '2BP01',
	},
	/** SQLSTATE class 2D */
	INVALID_TRANSACTION_TERMINATION: {
		GENERIC: '2D000',
	},
	/** SQLSTATE class 2F */
	SQL_ROUTINE_EXCEPTION: {
		GENERIC: '2F000',
		FUNCTION_EXECUTED_NO_RETURN_STATEMENT: '2F005',
		MODIFYING_SQL_DATA_NOT_PERMITTED: '2F002',
		PROHIBITED_SQL_STATEMENT_ATTEMPTED: '2F003',
		READING_SQL_DATA_NOT_PERMITTED: '2F004',
	},
	/** SQLSTATE class 34 */
	INVALID_CURSOR_NAME: {
		GENERIC: '34000',
	},
	/** SQLSTATE class 38 */
	EXTERNAL_ROUTINE_EXCEPTION: {
		GENERIC: '38000',
		CONTAINING_SQL_NOT_PERMITTED: '38001',
		MODIFYING_SQL_DATA_NOT_PERMITTED: '38002',
		PROHIBITED_SQL_STATEMENT_ATTEMPTED: '38003',
		READING_SQL_DATA_NOT_PERMITTED: '38004',
	},
	/** SQLSTATE class 39 */
	EXTERNAL_ROUTINE_INVOCATION_EXCEPTION: {
		GENERIC: '39000',
		INVALID_SQLSTATE_RETURNED: '39001',
		NULL_VALUE_NOT_ALLOWED: '39004',
		TRIGGER_PROTOCOL_VIOLATED: '39P01',
		SRF_PROTOCOL_VIOLATED: '39P02',
		EVENT_TRIGGER_PROTOCOL_VIOLATED: '39P03',
	},
	/** SQLSTATE class 3B */
	SAVEPOINT_EXCEPTION: {
		GENERIC: '3B000',
		INVALID_SAVEPOINT_SPECIFICATION: '3B001',
	},
	/** SQLSTATE class 3D */
	INVALID_CATALOG_NAME: {
		GENERIC: '3D000',
	},
	/** SQLSTATE class 3F */
	INVALID_SCHEMA_NAME: {
		GENERIC: '3F000',
	},
	/** SQLSTATE class 40 */
	TRANSACTION_ROLLBACK: {
		GENERIC: '40000',
		TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION: '40002',
		SERIALIZATION_FAILURE: '40001',
		STATEMENT_COMPLETION_UNKNOWN: '40003',
		DEADLOCK_DETECTED: '40P01',
	},
	/** SQLSTATE class 42 */
	SYNTAX_ERROR_OR_ACCESS_RULE_VIOLATION: {
		GENERIC: '42000',
		SYNTAX_ERROR: '42601',
		INSUFFICIENT_PRIVILEGE: '42501',
		CANNOT_COERCE: '42846',
		GROUPING_ERROR: '42803',
		WINDOWING_ERROR: '42P20',
		INVALID_RECURSION: '42P19',
		INVALID_FOREIGN_KEY: '42830',
		INVALID_NAME: '42602',
		NAME_TOO_LONG: '42622',
		RESERVED_NAME: '42939',
		DATATYPE_MISMATCH: '42804',
		INDETERMINATE_DATATYPE: '42P18',
		COLLATION_MISMATCH: '42P21',
		INDETERMINATE_COLLATION: '42P22',
		WRONG_OBJECT_TYPE: '42809',
		GENERATED_ALWAYS: '428C9',
		UNDEFINED_COLUMN: '42703',
		UNDEFINED_FUNCTION: '42883',
		UNDEFINED_TABLE: '42P01',
		UNDEFINED_PARAMETER: '42P02',
		UNDEFINED_OBJECT: '42704',
		DUPLICATE_COLUMN: '42701',
		DUPLICATE_CURSOR: '42P03',
		DUPLICATE_DATABASE: '42P04',
		DUPLICATE_FUNCTION: '42723',
		DUPLICATE_PREPARED_STATEMENT: '42P05',
		DUPLICATE_SCHEMA: '42P06',
		DUPLICATE_TABLE: '42P07',
		DUPLICATE_ALIAS: '42712',
		DUPLICATE_OBJECT: '42710',
		AMBIGUOUS_COLUMN: '42702',
		AMBIGUOUS_FUNCTION: '42725',
		AMBIGUOUS_PARAMETER: '42P08',
		AMBIGUOUS_ALIAS: '42P09',
		INVALID_COLUMN_REFERENCE: '42P10',
		INVALID_COLUMN_DEFINITION: '42611',
		INVALID_CURSOR_DEFINITION: '42P11',
		INVALID_DATABASE_DEFINITION: '42P12',
		INVALID_FUNCTION_DEFINITION: '42P13',
		INVALID_PREPARED_STATEMENT_DEFINITION: '42P14',
		INVALID_SCHEMA_DEFINITION: '42P15',
		INVALID_TABLE_DEFINITION: '42P16',
		INVALID_OBJECT_DEFINITION: '42P17',
	},
	/** SQLSTATE class 44 */
	WITH_CHECK_OPTION_VIOLATION: {
		GENERIC: '44000',
	},
	/** SQLSTATE class 53 */
	INSUFFICIENT_RESOURCES: {
		GENERIC: '53000',
		DISK_FULL: '53100',
		OUT_OF_MEMORY: '53200',
		TOO_MANY_CONNECTIONS: '53300',
		CONFIGURATION_LIMIT_EXCEEDED: '53400',
	},
	/** SQLSTATE class 54 */
	PROGRAM_LIMIT_EXCEEDED: {
		GENERIC: '54000',
		STATEMENT_TOO_COMPLEX: '54001',
		TOO_MANY_COLUMNS: '54011',
		TOO_MANY_ARGUMENTS: '54023',
	},
	/** SQLSTATE class 55 */
	OBJECT_NOT_IN_PREREQUISITE_STATE: {
		GENERIC: '55000',
		OBJECT_IN_USE: '55006',
		CANT_CHANGE_RUNTIME_PARAM: '55P02',
		LOCK_NOT_AVAILABLE: '55P03',
		UNSAFE_NEW_ENUM_VALUE_USAGE: '55P04',
	},
	/** SQLSTATE class 57 */
	OPERATOR_INTERVENTION: {
		GENERIC: '57000',
		QUERY_CANCELED: '57014',
		ADMIN_SHUTDOWN: '57P01',
		CRASH_SHUTDOWN: '57P02',
		CANNOT_CONNECT_NOW: '57P03',
		DATABASE_DROPPED: '57P04',
		IDLE_SESSION_TIMEOUT: '57P05',
	},
	/** SQLSTATE class 58 */
	SYSTEM_ERROR: {
		GENERIC: '58000',
		IO_ERROR: '58030',
		UNDEFINED_FILE: '58P01',
		DUPLICATE_FILE: '58P02',
		FILE_NAME_TOO_LONG: '58P03',
	},
	/** SQLSTATE class F0 */
	CONFIG_FILE_ERROR: {
		GENERIC: 'F0000',
		LOCK_FILE_EXISTS: 'F0001',
	},
	/** SQLSTATE class HV */
	FDW_ERROR: {
		GENERIC: 'HV000',
		FDW_COLUMN_NAME_NOT_FOUND: 'HV005',
		FDW_DYNAMIC_PARAMETER_VALUE_NEEDED: 'HV002',
		FDW_FUNCTION_SEQUENCE_ERROR: 'HV010',
		FDW_INCONSISTENT_DESCRIPTOR_INFORMATION: 'HV021',
		FDW_INVALID_ATTRIBUTE_VALUE: 'HV024',
		FDW_INVALID_COLUMN_NAME: 'HV007',
		FDW_INVALID_COLUMN_NUMBER: 'HV008',
		FDW_INVALID_DATA_TYPE: 'HV004',
		FDW_INVALID_DATA_TYPE_DESCRIPTORS: 'HV006',
		FDW_INVALID_DESCRIPTOR_FIELD_IDENTIFIER: 'HV091',
		FDW_INVALID_HANDLE: 'HV00B',
		FDW_INVALID_OPTION_INDEX: 'HV00C',
		FDW_INVALID_OPTION_NAME: 'HV00D',
		FDW_INVALID_STRING_LENGTH_OR_BUFFER_LENGTH: 'HV090',
		FDW_INVALID_STRING_FORMAT: 'HV00A',
		FDW_INVALID_USE_OF_NULL_POINTER: 'HV009',
		FDW_TOO_MANY_HANDLES: 'HV014',
		FDW_OUT_OF_MEMORY: 'HV001',
		FDW_NO_SCHEMAS: 'HV00P',
		FDW_OPTION_NAME_NOT_FOUND: 'HV00J',
		FDW_REPLY_HANDLE: 'HV00K',
		FDW_SCHEMA_NOT_FOUND: 'HV00Q',
		FDW_TABLE_NOT_FOUND: 'HV00R',
		FDW_UNABLE_TO_CREATE_EXECUTION: 'HV00L',
		FDW_UNABLE_TO_CREATE_REPLY: 'HV00M',
		FDW_UNABLE_TO_ESTABLISH_CONNECTION: 'HV00N',
	},
	/** SQLSTATE class P0 */
	PLPGSQL_ERROR: {
		GENERIC: 'P0000',
		RAISE_EXCEPTION: 'P0001',
		NO_DATA_FOUND: 'P0002',
		TOO_MANY_ROWS: 'P0003',
		ASSERT_FAILURE: 'P0004',
	},
	/** SQLSTATE class XX */
	INTERNAL_ERROR: {
		GENERIC: 'XX000',
		DATA_CORRUPTED: 'XX001',
		INDEX_CORRUPTED: 'XX002',
	},
} as const;

export type PgErrorCode = {
	[K in keyof typeof PG_ERROR]: (typeof PG_ERROR)[K][keyof (typeof PG_ERROR)[K]];
}[keyof typeof PG_ERROR];

export type PgConstraintType = 'unique' | 'not_null' | 'foreign_key' | 'check' | 'exclusion';

const pgConstraintTypes: Record<string, PgConstraintType> = {
	[PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.NOT_NULL_VIOLATION]: 'not_null',
	[PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.FOREIGN_KEY_VIOLATION]: 'foreign_key',
	[PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.UNIQUE_VIOLATION]: 'unique',
	[PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.CHECK_VIOLATION]: 'check',
	[PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.EXCLUSION_VIOLATION]: 'exclusion',
};

/**
 * The shape of a PostgreSQL error report as surfaced by the different drivers.
 * `node-postgres` reports camelCase fields (`internalQuery`, `constraint`),
 * `postgres.js` reports snake_case fields (`internal_query`, `constraint_name`).
 */
interface PgDriverError extends Error {
	code?: string;
	severity?: string;
	severity_local?: string;
	severityLocal?: string;
	detail?: string;
	hint?: string;
	position?: string;
	internal_position?: string;
	internalPosition?: string;
	internal_query?: string;
	internalQuery?: string;
	where?: string;
	schema?: string;
	schema_name?: string;
	table?: string;
	table_name?: string;
	column?: string;
	column_name?: string;
	dataType?: string;
	datatype_name?: string;
	constraint?: string;
	constraint_name?: string;
	file?: string;
	line?: string;
	routine?: string;
}

/**
 * `DrizzleQueryError` carrying the full PostgreSQL error report.
 *
 * The original driver error is preserved on {@link DrizzleQueryError.cause}.
 *
 * @example
 * ```ts
 * import { is } from 'drizzle-orm';
 * import { PG_ERROR, PgQueryError } from 'drizzle-orm/pg-core';
 *
 * try {
 * 	await db.insert(users).values({ email });
 * } catch (e) {
 * 	if (is(e, PgQueryError) && e.code === PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.UNIQUE_VIOLATION) {
 * 		// e.constraintName, e.tableName, e.columnNames, ...
 * 	}
 * }
 * ```
 */
export class PgQueryError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'PgQueryError';

	/** SQLSTATE code, e.g. `'23505'`. Compare against {@link PG_ERROR} constants. */
	readonly code?: string;
	readonly severity?: string;
	readonly severityLocal?: string;
	readonly detail?: string;
	readonly hint?: string;
	readonly position?: string;
	readonly internalPosition?: string;
	readonly internalQuery?: string;
	readonly where?: string;
	readonly schemaName?: string;
	readonly tableName?: string;
	readonly columnName?: string;
	readonly dataTypeName?: string;
	readonly constraintName?: string;
	readonly file?: string;
	readonly line?: string;
	readonly routine?: string;

	/**
	 * The kind of integrity constraint that was violated, when {@link code}
	 * is a SQLSTATE class-23 error. `undefined` for any other error.
	 */
	readonly constraintType?: PgConstraintType;

	/**
	 * Column names extracted from the `Key (col1, col2)=(...)` portion of
	 * {@link detail}, reported for integrity constraint violations.
	 * Empty when the server did not report key columns.
	 */
	readonly columnNames: string[];

	constructor(query: string, params: any[], cause: PgDriverError) {
		super(query, params, cause);
		this.name = 'PgQueryError';
		Error.captureStackTrace(this, PgQueryError);

		this.code = cause.code;
		this.severity = cause.severity;
		this.severityLocal = cause.severity_local ?? cause.severityLocal;
		this.detail = cause.detail;
		this.hint = cause.hint;
		this.position = cause.position;
		this.internalPosition = cause.internal_position ?? cause.internalPosition;
		this.internalQuery = cause.internal_query ?? cause.internalQuery;
		this.where = cause.where;
		this.schemaName = cause.schema_name ?? cause.schema;
		this.tableName = cause.table_name ?? cause.table;
		this.columnName = cause.column_name ?? cause.column;
		this.dataTypeName = cause.datatype_name ?? cause.dataType;
		this.constraintName = cause.constraint_name ?? cause.constraint;
		this.file = cause.file;
		this.line = cause.line;
		this.routine = cause.routine;
		this.constraintType = cause.code === undefined ? undefined : pgConstraintTypes[cause.code];
		this.columnNames = parseKeyColumns(cause.detail);
	}
}

/** @internal */
export function isPgDriverError(error: unknown): error is PgDriverError {
	if (typeof error !== 'object' || error === null) {
		return false;
	}
	const { code, severity } = error as PgDriverError;
	// SQLSTATE codes are five-character alphanumeric strings; drivers attach
	// `severity` on top of that. Both are required so e.g. Node system errors
	// or pool errors are not mistaken for database error reports.
	return typeof code === 'string' && /^[\dA-Z]{5}$/.test(code) && typeof severity === 'string';
}

/** @internal */
export function wrapPgQueryError(query: string, params: any[], error: unknown): DrizzleQueryError {
	return isPgDriverError(error)
		? new PgQueryError(query, params, error)
		: new DrizzleQueryError(query, params, error as Error);
}

// PostgreSQL reports the offending values for integrity constraint violations
// as `Key (col1, "col, 2")=(val1, val2) ...` in the `detail` field.
function parseKeyColumns(detail: string | undefined): string[] {
	if (detail === undefined) {
		return [];
	}
	const match = /^Key \(([^)]+)\)=/.exec(detail);
	if (match === null) {
		return [];
	}
	const columns: string[] = [];
	for (const token of match[1]!.matchAll(/"((?:[^"]|"")*)"|([^",]+)/g)) {
		const column = (token[1] ?? token[2]!).replaceAll('""', '"').trim();
		if (column !== '') {
			columns.push(column);
		}
	}
	return columns;
}
