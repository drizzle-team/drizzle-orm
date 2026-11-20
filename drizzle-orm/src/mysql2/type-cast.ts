import type { TypeCast } from 'mysql2';

// The per-query `typeCast` of the drivers built on the `mysql2` client: MySQL and SingleStore

/**
 * `bigint` as a number in the safe integer range (as `mysql2` returns it by default, e.g. for `count(*)`), exact text
 * outside of it - `supportBigNumbers` and `bigNumberStrings` don't apply
 */
const safeIntegerOrText = (value: string | null) => {
	if (value === null) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) ? number : value;
};

const parseJsonField = (value: string | null) => value === null ? null : JSON.parse(value);

/** Field types returned as text for codecs to decode: their default decoding depends on client options and loses data */
const rawTextFieldTypes: ReadonlySet<string> = new Set([
	'DECIMAL',
	'NEWDECIMAL', // `decimal`: `number` with `decimalNumbers`
	'DATE',
	'DATETIME',
	'DATETIME2',
	'TIMESTAMP',
	'TIMESTAMP2', // temporal: `Date` in the connection's `timezone` unless `dateStrings` is set, years below 100 misread
]);

export type TypeCastFunction = Exclude<TypeCast, boolean>;

/** Client's own `typeCast`, which a per-query `typeCast` replaces */
const clientTypeCast = (client: unknown): TypeCastFunction | undefined => {
	const c = client as {
		pool?: { config?: { connectionConfig?: { typeCast?: unknown } } };
		connection?: { config?: { typeCast?: unknown } };
	};
	const typeCast = c.pool?.config?.connectionConfig?.typeCast ?? c.connection?.config?.typeCast;
	return typeof typeCast === 'function' ? typeCast as TypeCastFunction : undefined;
};

/**
 * Per-query `typeCast` returning `rawTextFieldTypes` as text and `JSON` parsed whatever `jsonStrings` is set to
 * (relational queries' nested results are `JSON` values), other fields decoded by the client's own `typeCast`.
 * Applied to queries decoded by codecs (queries with a mapper), proxy servers apply it to such queries as well
 * @param client - client whose own `typeCast` decodes the remaining fields; without it, the driver's default decoding does
 */
export const makeMySql2RawTextTypeCast = (client?: unknown): TypeCastFunction => {
	const own = client === undefined ? undefined : clientTypeCast(client);
	return (field, next) =>
		rawTextFieldTypes.has(field.type)
			? field.string()
			: field.type === 'LONGLONG'
			? safeIntegerOrText(field.string())
			: field.type === 'JSON'
			? parseJsonField(field.string('utf8'))
			: own
			? own(field, next)
			: next();
};
