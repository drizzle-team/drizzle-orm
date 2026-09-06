import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';

/**
 * Common PostgreSQL SQLSTATE codes used for typed error handling.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_ERROR = {
	UNIQUE_VIOLATION: '23505',
	NOT_NULL_VIOLATION: '23502',
	FOREIGN_KEY_VIOLATION: '23503',
	CHECK_VIOLATION: '23514',
	EXCLUSION_VIOLATION: '23P01',
	INVALID_TEXT_REPRESENTATION: '22P02',
	STRING_DATA_RIGHT_TRUNCATION: '22001',
	NUMERIC_VALUE_OUT_OF_RANGE: '22003',
} as const;

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR] | (string & {});

type DriverLike = {
	code?: unknown;
	severity?: unknown;
	detail?: unknown;
	hint?: unknown;
	schema?: unknown;
	schema_name?: unknown;
	table?: unknown;
	table_name?: unknown;
	column?: unknown;
	column_name?: unknown;
	constraint?: unknown;
	constraint_name?: unknown;
	dataType?: unknown;
	data_type?: unknown;
	message?: unknown;
};

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Parse `Key (email, name)=(a, b) already exists.` style PG detail strings. */
export function parsePgDetailKeys(detail: string | undefined): { columns?: string[]; values?: string[] } {
	if (!detail) return {};
	const match = detail.match(/Key \(([^)]+)\)=\(([^)]*)\)/i);
	if (!match) return {};
	const columns = match[1].split(',').map((s) => s.trim()).filter(Boolean);
	const values = match[2].split(',').map((s) => s.trim());
	return {
		columns: columns.length ? columns : undefined,
		values: values.length ? values : undefined,
	};
}

function extractPgDriverFields(cause: unknown): DriverLike | undefined {
	if (!cause || typeof cause !== 'object') return undefined;
	const c = cause as DriverLike & { cause?: unknown };
	// postgres.js uses `.code`; node-pg too. Sometimes nested under `.cause`.
	if (typeof c.code === 'string') return c;
	if (c.cause && typeof c.cause === 'object' && typeof (c.cause as DriverLike).code === 'string') {
		return c.cause as DriverLike;
	}
	return c;
}

/**
 * Dialect-native Postgres query error. Extends `DrizzleQueryError` so existing
 * catch sites keep working, while exposing SQLSTATE + constraint metadata.
 *
 * Differentiates from constraint-only wrappers by keeping the full dialect
 * error surface (severity/detail/hint/schema) and SQLSTATE constants, matching
 * the contributor-proposed PgError API discussed on #376.
 */
export class PgError extends DrizzleQueryError {
	static readonly [entityKind]: string = 'PgError';

	readonly code: string;
	readonly severity?: string;
	readonly detail?: string;
	readonly hint?: string;
	readonly schema?: string;
	readonly table?: string;
	readonly column?: string;
	readonly constraint?: string;
	readonly dataType?: string;
	readonly keyColumns?: string[];
	readonly keyValues?: string[];

	constructor(
		query: string,
		params: any[],
		cause: Error | undefined,
		fields: {
			code: string;
			severity?: string;
			detail?: string;
			hint?: string;
			schema?: string;
			table?: string;
			column?: string;
			constraint?: string;
			dataType?: string;
			keyColumns?: string[];
			keyValues?: string[];
		},
	) {
		super(query, params, cause);
		this.name = 'PgError';
		this.code = fields.code;
		this.severity = fields.severity;
		this.detail = fields.detail;
		this.hint = fields.hint;
		this.schema = fields.schema;
		this.table = fields.table;
		this.column = fields.column;
		this.constraint = fields.constraint;
		this.dataType = fields.dataType;
		this.keyColumns = fields.keyColumns;
		this.keyValues = fields.keyValues;
		Error.captureStackTrace?.(this, PgError);
	}

	/** Convenience: first key column from a unique/FK detail, else `column`. */
	getColumnNames(): string[] {
		if (this.keyColumns?.length) return [...this.keyColumns];
		if (this.column) return [this.column];
		return [];
	}
}

export function isPgError(error: unknown): error is PgError {
	return is(error, PgError);
}

export function isPgUniqueViolation(error: unknown): error is PgError {
	return isPgError(error) && error.code === PG_ERROR.UNIQUE_VIOLATION;
}

export function isPgNotNullViolation(error: unknown): error is PgError {
	return isPgError(error) && error.code === PG_ERROR.NOT_NULL_VIOLATION;
}

export function isPgForeignKeyViolation(error: unknown): error is PgError {
	return isPgError(error) && error.code === PG_ERROR.FOREIGN_KEY_VIOLATION;
}

export function isPgCheckViolation(error: unknown): error is PgError {
	return isPgError(error) && error.code === PG_ERROR.CHECK_VIOLATION;
}

export function isPgInvalidTextRepresentation(error: unknown): error is PgError {
	return isPgError(error) && error.code === PG_ERROR.INVALID_TEXT_REPRESENTATION;
}

export function wrapPgError(query: string, params: any[], cause: unknown): DrizzleQueryError {
	const err = cause instanceof Error ? cause : new Error(String(cause));
	const driver = extractPgDriverFields(cause);
	const code = asString(driver?.code);
	if (!driver || !code) {
		return new DrizzleQueryError(query, params, err);
	}

	const detail = asString(driver.detail);
	const parsed = parsePgDetailKeys(detail);

	return new PgError(query, params, err, {
		code,
		severity: asString(driver.severity),
		detail,
		hint: asString(driver.hint),
		schema: asString(driver.schema) ?? asString(driver.schema_name),
		table: asString(driver.table) ?? asString(driver.table_name),
		column: asString(driver.column) ?? asString(driver.column_name),
		constraint: asString(driver.constraint) ?? asString(driver.constraint_name),
		dataType: asString(driver.dataType) ?? asString(driver.data_type),
		keyColumns: parsed.columns,
		keyValues: parsed.values,
	});
}
