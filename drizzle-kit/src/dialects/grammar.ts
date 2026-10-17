export const escapeForSqlDefault = (input: string, mode: 'default' | 'pg-arr' = 'default') => {
	let value = input.replace(/\\/g, '\\\\').replace(/'/g, "''");
	if (mode === 'pg-arr') value = value.replaceAll('"', '\\"');
	return value;
};

export const unescapeFromSqlDefault = (input: string, mode: 'default' | 'arr' = 'default') => {
	let res = input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

	if (mode === 'arr') return res;
	return res.replace(/''/g, "'");
};

export const escapeForTsLiteral = (input: string) => {
	return JSON.stringify(input);
};

/**
 * Escapes raw sql so it can be embedded into a `sql` template literal of a generated file,
 * a backslash of a sql escape sequence(`_utf8mb4\'\'`) would otherwise be eaten by TypeScript
 */
export const escapeForSqlTemplate = (sql: string) => {
	return sql.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
};

/**
 * Checks that the text of a default is a single sql string literal: `'text'`, a quote inside it is doubled
 */
export const isSqlStringLiteral = (value: string) => {
	return /^'(?:[^']|'')*'$/s.test(value);
};

/**
 * Checks that the text of a default can be printed as a TypeScript number as it is
 */
export const isNumberLiteral = (value: string) => {
	return value.trim() !== '' && (!Number.isNaN(Number(value)) || value === 'NaN');
};

export const numberForTs = (value: string): { mode: 'number' | 'bigint'; value: string } => {
	const check = Number(value);
	if (Number.isNaN(check)) return { mode: 'number', value: `sql\`${escapeForSqlTemplate(value)}\`` };

	if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return { mode: 'number', value: value };
	return { mode: 'bigint', value: `${value}n` };
};

// numeric precision can be bigger than 9 as it was before here
export const parseParams = (type: string) => {
	return type.match(/\(((?:\d+(?:\s*,\s*\d+)*)|max)\)/i)?.[1].split(',').map((x) => x.trim()) ?? [];
};
