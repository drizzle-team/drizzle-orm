import { assertUnreachable, trimChar } from '../../utils';
import { parse, stringify } from '../../utils/when-json-met-bigint';
import { escapeForTsLiteral } from '../utils';
import type { Column, DiffEntities, ForeignKey } from './ddl';
import type { Import } from './typescript';

const namedCheckPattern = /CONSTRAINT\s+["'`[]?(\w+)["'`\]]?\s+CHECK\s*\((.*)\)/gi;
const unnamedCheckPattern = /CHECK\s+\((.*)\)/gi;
const viewAsStatementRegex = new RegExp(`\\bAS\\b\\s+(WITH.+|SELECT.+)$`, 'is'); // 'i' for case-insensitive, 's' for dotall mode

export const nameForForeignKey = (fk: Pick<ForeignKey, 'table' | 'columns' | 'tableTo' | 'columnsTo'>) => {
	return `fk_${fk.table}_${fk.columns.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`;
};

export const nameForUnique = (table: string, columns: string[]) => {
	return `${table}_${columns.join('_')}_unique`;
};

export const nameForPk = (table: string) => {
	return `${table}_pk`;
};

export interface SqlType<MODE = unknown> {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, mode?: MODE): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	toTs(
		value: Column['default'],
		type: string,
	): { def: string; options?: Record<string, string | number | boolean>; customType?: string } | string;
}

const intAffinities = [
	'int',
	'integer',
	'tiniint',
	'smallint',
	'mediumint',
	'bigint',
	'unsigned big int',
	'int2',
	'int8',
];

export const Int: SqlType<'timestamp' | 'timestamp_ms'> = {
	is(type) {
		return intAffinities.indexOf(type.toLowerCase()) >= 0;
	},
	drizzleImport: () => 'integer',
	defaultFromDrizzle: (value, mode) => {
		// if (typeof value === 'boolean') {
		// 	return value ? '1' : '0';
		// }

		if (typeof value === 'bigint') {
			return `'${value.toString()}'`;
		}

		if (value instanceof Date) {
			const v = mode === 'timestamp' ? value.getTime() / 1000 : value.getTime();
			return v.toFixed(0);
		}

		return String(value);
	},
	defaultFromIntrospect: (value) => {
		const it = trimChar(value, "'");
		const check = Number(it);
		if (Number.isNaN(check)) return value; // unknown
		if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return it;
		return it; // bigint
	},
	toTs: (value) => {
		if (!value) return '';

		if (value === 'true' || value === 'false') {
			return { def: value, options: { mode: 'boolean' } };
		}

		const check = Number(value);
		if (Number.isNaN(check)) return `sql\`${value}\``; // unknown
		if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return value;
		return `${value}n`; // bigint
	},
};

const realAffinities = [
	'real',
	'double',
	'double precision',
	'float',
];

export const Real: SqlType = {
	is: function(type: string): boolean {
		return realAffinities.indexOf(type.toLowerCase()) >= 0;
	},
	drizzleImport: function(): Import {
		return 'real';
	},
	defaultFromDrizzle: function(value: unknown): Column['default'] {
		return String(value);
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return value;
	},
	toTs: function(value: Column['default']): string {
		return value ?? '';
	},
};

const numericAffinities = [
	'numeric',
	'decimal',
	'boolean',
	'date',
	'datetime',
];
export const Numeric: SqlType = {
	is: function(type: string): boolean {
		const lowered = type.toLowerCase();

		return numericAffinities.indexOf(lowered) >= 0
			|| lowered.startsWith('numeric(')
			|| lowered.startsWith('decimal(');
	},
	drizzleImport: function(): Import {
		return 'numeric';
	},
	defaultFromDrizzle: function(value: unknown, _mode?: unknown): Column['default'] {
		if (typeof value === 'string') return `'${value}'`;
		if (typeof value === 'bigint') return `'${value.toString()}'`;
		if (typeof value === 'number') return `${value.toString()}`;
		throw new Error(`unexpected: ${value} ${typeof value}`);
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return value;
	},
	toTs: function(value: Column['default']) {
		if (!value) return '';
		const check = Number(value);

		if (Number.isNaN(check)) return value; // unknown
		if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) {
			return { def: value, options: { mode: 'number' } };
		}
		return { def: `${value}n`, options: { mode: 'bigint' } }; // bigint
	},
};

const textAffinities = [
	'text',
	'character',
	'varchar',
	'varying character',
	'nchar',
	'native character',
	'nvarchar',
	'clob',
];

export const Text: SqlType = {
	is: function(type: string): boolean {
		const lowered = type.toLowerCase();
		return textAffinities.indexOf(lowered) >= 0
			|| lowered.startsWith('text(')
			|| lowered.startsWith('character(')
			|| lowered.startsWith('varchar(')
			|| lowered.startsWith('varying character(')
			|| lowered.startsWith('nchar(')
			|| lowered.startsWith('native character(')
			|| lowered.startsWith('nvarchar(')
			|| lowered.startsWith('clob(');
	},
	drizzleImport: function(): Import {
		return 'text';
	},
	defaultFromDrizzle: function(value: unknown, _mode?: unknown): Column['default'] {
		let result: string;
		if (typeof value === 'string') result = value.replaceAll('\\', '\\\\').replaceAll("'", "''");
		else if (typeof value === 'object' || Array.isArray(value)) {
			result = stringify(value, (_, value) => {
				if (typeof value !== 'string') return value;
				return value.replaceAll("'", "''");
			});
		} else {
			throw new Error(`unexpected default: ${value}`);
		}
		return `'${result}'`;
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return value;
	},
	toTs: function(value: Column['default']) {
		if (value === null) return '';
		if (!value.startsWith("'")) return `sql\`${value}\``; // CURRENT_TIMESTAMP

		try {
			const parsed = parse(trimChar(value, "'"), (_, v) => {
				if (typeof v === 'string') {
					return v.replaceAll("''", "'");
				}
				return v;
			});

			return {
				def: stringify(parsed, undefined, undefined, true)!,
				options: { mode: 'json' },
			};
		} catch {}

		const escaped = trimChar(value, "'").replaceAll("''", "'").replaceAll('"', '\\"');
		return `"${escaped}"`;
	},
};

export const Blob: SqlType = {
	is: function(type: string): boolean {
		const lowered = type.toLowerCase();
		return lowered === 'blob' || lowered.startsWith('blob');
	},
	drizzleImport: function(): Import {
		return 'blob';
	},
	defaultFromDrizzle: function(value: unknown): Column['default'] {
		if (typeof value === 'bigint') return `'${value.toString()}'`;
		if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(value)) {
			return `X'${value.toString('hex').toUpperCase()}'`;
		}
		if (Array.isArray(value) || typeof value === 'object') {
			return Text.defaultFromDrizzle(value);
		}
		throw new Error('unexpected');
	},
	defaultFromIntrospect: function(value: string) {
		return value;
	},
	toTs: function(value, type) {
		if (value === null) return '';

		if (typeof Buffer !== 'undefined' && value.startsWith("X'")) {
			const parsed = Buffer.from(value.slice(2, value.length - 1), 'hex').toString('utf-8');
			const escaped = parsed.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
			return `Buffer.from("${escaped}")`;
		}

		try {
			const trimmed = trimChar(value, "'");
			const num = Number(trimmed);
			if (!Number.isNaN(num)) {
				if (num >= Number.MIN_SAFE_INTEGER && num <= Number.MAX_SAFE_INTEGER) {
					return String(num);
				} else {
					return `${trimmed}n`;
				}
			}
		} catch {}

		return Text.toTs(value, type);
	},
};

export const Custom: SqlType = {
	is: (_type: string) => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'customType',
	defaultFromDrizzle: (value) => {
		if (!value) return '';
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: function(value, type) {
		if (!value) return { def: '', customType: type };
		const escaped = escapeForTsLiteral(value);
		return { def: escaped, customType: type };
	},
};

export const typeFor = (sqlType: string): SqlType => {
	if (Int.is(sqlType)) return Int;
	if (Real.is(sqlType)) return Real;
	if (Numeric.is(sqlType)) return Numeric;
	if (Text.is(sqlType)) return Text;
	if (Blob.is(sqlType)) return Blob;
	if (Numeric.is(sqlType)) return Numeric;

	// If no specific type matches, default to Custom
	return Custom;
};

// https://www.sqlite.org/datatype3.html
export function sqlTypeFrom(sqlType: string): string {
	const lowered = sqlType.toLowerCase();
	if (
		[
			'int',
			// 'integer', redundant
			// 'integer auto_increment', redundant
			'tinyint',
			'smallint',
			'mediumint',
			'bigint',
			'unsigned big int',
			// 'int2', redundant
			// 'int8', redundant
		].some((it) => lowered.startsWith(it))
	) {
		return 'integer';
	}

	if (
		[
			'character',
			'varchar',
			'varying character',
			'national varying character',
			'nchar',
			'native character',
			'nvarchar',
			'text',
			'clob',
		].some((it) => lowered.startsWith(it))
	) {
		const match = lowered.match(/\d+/);

		if (match) {
			return `text(${match[0]})`;
		}

		return 'text';
	}

	if (lowered.startsWith('blob')) {
		return 'blob';
	}

	if (
		['real', 'double', 'double precision', 'float'].some((it) => lowered.startsWith(it))
	) {
		return 'real';
	}

	// https://www.sqlite.org/datatype3.html -> 3.1.1. Affinity Name Examples
	if (
		['numeric', 'decimal', 'boolean', 'date', 'datetime'].some((it) => lowered.startsWith(it))
	) {
		return 'numeric';
	}

	return sqlType;
}

export const parseDefault = (type: string, it: string): Column['default'] => {
	if (it === null) return null;
	const grammarType = typeFor(type);

	if (grammarType) return grammarType.defaultFromIntrospect(it);

	const trimmed = trimChar(it, "'");

	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
		const n = Number(it);

		if (n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER) {
			return trimmed;
		}
		return `'${trimmed}'`;
	}

	// TODO: handle where and need tests??
	if (['CURRENT_TIME', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(it)) {
		return `(${it})`;
	}
	return `(${it})`;
};

export const parseTableSQL = (sql: string) => {
	const namedChecks = [...sql.matchAll(namedCheckPattern)].map((it) => {
		const [_, name, value] = it;
		return { name, value: value.trim() };
	});
	const unnamedChecks = [...sql.matchAll(unnamedCheckPattern)].map((it) => {
		const [_, value] = it;
		return { name: null, value: value.trim() };
	}).filter((it) => !namedChecks.some((x) => x.value === it.value));

	return {
		checks: [...namedChecks, ...unnamedChecks],
	};
};

export const parseViewSQL = (sql: string) => {
	const match = sql.match(viewAsStatementRegex);
	return match ? match[1] : null;
};

export interface Generated {
	as: string;
	type: 'stored' | 'virtual';
}

export function extractGeneratedColumns(input: string): Record<string, Generated> {
	const columns: Record<string, Generated> = {};
	const regex = /["'`[]?(\w+)["'`\]]?\s+(\w+)\s+GENERATED\s+ALWAYS\s+AS\s*\(/gi;

	let match: RegExpExecArray | null;
	while ((match = regex.exec(input)) !== null) {
		const columnName = match[1];
		let startIndex = regex.lastIndex - 1; // position of '('
		let depth = 1;
		let endIndex = startIndex + 1;

		// Find matching closing parenthesis
		while (endIndex < input.length && depth > 0) {
			const char = input[endIndex];
			if (char === '(') depth++;
			else if (char === ')') depth--;
			endIndex++;
		}

		const expression = input.slice(startIndex, endIndex).trim();

		// Find STORED/VIRTUAL type after the expression
		const afterExpr = input.slice(endIndex);
		const typeMatch = afterExpr.match(/\b(STORED|VIRTUAL)\b/i);
		const type = typeMatch ? typeMatch[1].toLowerCase() as Generated['type'] : 'virtual';

		columns[columnName] = {
			as: expression,
			type,
		};
	}
	return columns;
}

export const omitSystemTables = () => {
	// ['__drizzle_migrations', `'\\_cf\\_%'`, `'\\_litestream\\_%'`, `'libsql\\_%'`, `'sqlite\\_%'`];
	return true;
};

interface IParseResult {
	uniques: { name: string | null; columns: string[] }[];
	pk: { name: string | null; columns: string[] };
}

/**
 * Parses a SQLite DDL string to find primary key and unique constraints
 * Handles quoted with [], ``, "", or no quotes
 */
export function parseSqliteDdl(ddl: string): IParseResult {
	const result: IParseResult = {
		pk: { name: null, columns: [] },
		uniques: [],
	};

	const cleanIdentifier = (identifier: string): string => {
		return identifier.trim().replace(/^(?:\[|`|")/, '').replace(/(?:\]|`|")$/, '');
	};

	const parseColumns = (columnsStr: string): string[] => {
		return columnsStr.split(',').map((c) => cleanIdentifier(c));
	};

	const normalizedDdl = ddl.replace(/(\r\n|\n|\r)/gm, ' ').replace(/\s+/g, ' ');
	const bodyMatch = normalizedDdl.match(/CREATE\s+TABLE.*?\((.*)\)/i);
	if (!bodyMatch) {
		return result; // Not a valid CREATE TABLE statement
	}
	let tableBody = bodyMatch[1];

	const ident = '(?:\\[[^\\]]+\\]|`[^`]+`|"[^"]+"|[\\w_]+)';

	// find table level UNIQUE constraints
	const uniqueConstraintRegex = new RegExp(`CONSTRAINT\\s+(${ident})\\s+UNIQUE\\s*\\(([^)]+)\\)`, 'gi');
	tableBody = tableBody.replace(uniqueConstraintRegex, (match, name, columns) => {
		result.uniques.push({ name: cleanIdentifier(name), columns: parseColumns(columns) });
		return ''; // remove the matched constraint from the string
	});

	// find table level PRIMARY KEY constraint
	const pkConstraintRegex = new RegExp(`CONSTRAINT\\s+(${ident})\\s+PRIMARY\\s+KEY\\s*\\(([^)]+)\\)`, 'i');
	tableBody = tableBody.replace(pkConstraintRegex, (match, name, columns) => {
		result.pk = { name: cleanIdentifier(name), columns: parseColumns(columns) };
		return ''; // remove the matched constraint from the string
	});

	// split the remaining body into individual definition parts
	const definitions = tableBody.split(',').filter((def) => def.trim() !== '');

	const inlineConstraintNameRegex = new RegExp(`CONSTRAINT\\s+(${ident})`, 'i');
	for (const def of definitions) {
		const trimmedDef = def.trim();

		// find inline PRIMARY KEY
		const inlinePkRegex = new RegExp(`^(${ident})\\s+.*\\bPRIMARY\\s+KEY\\b`, 'i');
		const pkMatch = trimmedDef.match(inlinePkRegex);
		if (pkMatch) {
			const pkColumn = cleanIdentifier(pkMatch[1]);
			// check for an inline constraint name -> `id INT CONSTRAINT pk_id PRIMARY KEY`
			const pkNameMatch = trimmedDef.match(inlineConstraintNameRegex);
			result.pk = { name: pkNameMatch ? cleanIdentifier(pkNameMatch[1]) : null, columns: [pkColumn] };
		}

		// find inline UNIQUE
		const inlineUniqueRegex = new RegExp(`^(${ident})\\s+.*\\bUNIQUE\\b`, 'i');
		const uniqueMatch = trimmedDef.match(inlineUniqueRegex);
		if (uniqueMatch) {
			const uqColumn = cleanIdentifier(uniqueMatch[1]);
			const alreadyExists = result.uniques.some((u) => u.columns.length === 1 && u.columns[0] === uqColumn);
			const uqNameMatch = trimmedDef.match(inlineConstraintNameRegex);
			const uqName = uqNameMatch ? cleanIdentifier(uqNameMatch[1]) : null;
			if (!alreadyExists) {
				result.uniques.push({ name: uqName, columns: [uqColumn] });
			}
		}
	}

	return result;
}

interface IFkConstraint {
	name: string | null;
	fromTable: string; // The table where the FK is defined
	toTable: string; // The table being referenced
	fromColumns: string[]; // Columns in the current table
	toColumns: string[]; // Columns in the referenced table
}
/**
 * Parses a SQLite DDL string to find all foreign key constraints
 */
export function parseSqliteFks(ddl: string): IFkConstraint[] {
	const results: IFkConstraint[] = [];

	const cleanIdentifier = (identifier: string): string => {
		return identifier.trim().replace(/^(?:\[|`|")/, '').replace(/(?:\]|`|")$/, '');
	};

	const parseColumns = (columnsStr: string): string[] => {
		return columnsStr.split(',').map((c) => cleanIdentifier(c));
	};

	const normalizedDdl = ddl.replace(/(\r\n|\n|\r)/gm, ' ').replace(/\s+/g, ' ');

	// find the name of the table being created (the "from" table)
	const ident = '(?:\\[[^\\]]+\\]|`[^`]+`|"[^"]+"|[\\w_]+)';
	const fromTableMatch = normalizedDdl.match(
		new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${ident})`, 'i'),
	);
	if (!fromTableMatch) {
		return results; // Not a valid CREATE TABLE statement
	}
	const fromTable = cleanIdentifier(fromTableMatch[1]);

	const bodyMatch = normalizedDdl.match(/\((.*)\)/i);
	if (!bodyMatch) {
		return results;
	}
	let tableBody = bodyMatch[1];

	// find and remove all table level FOREIGN KEY constraints
	const tableFkRegex = new RegExp(
		`(?:CONSTRAINT\\s+(${ident})\\s+)?FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s+REFERENCES\\s+(${ident})(?:\\s*\\(([^)]+)\\))?`,
		'gi',
	);

	tableBody = tableBody.replace(tableFkRegex, (match, name, fromCols, refTable, toCols) => {
		results.push({
			name: name ? cleanIdentifier(name) : null,
			fromTable: fromTable,
			toTable: cleanIdentifier(refTable),
			fromColumns: parseColumns(fromCols),
			toColumns: toCols ? parseColumns(toCols) : [],
		});
		return ''; // Remove from DDL body
	});

	// find inline REFERENCES on the cleaned string
	const definitions = tableBody.split(',').filter((def) => def.trim() !== '');

	for (const def of definitions) {
		const trimmedDef = def.trim();

		const inlineFkRegex = new RegExp(
			`^(${ident}).*?\\s+REFERENCES\\s+(${ident})(?:\\s*\\(([^)]+)\\))?`,
			'i',
		);
		const inlineMatch = trimmedDef.match(inlineFkRegex);

		if (inlineMatch) {
			const fromColumn = cleanIdentifier(inlineMatch[1]);
			const toTable = cleanIdentifier(inlineMatch[2]);
			const toColumn = inlineMatch[3] ? cleanIdentifier(inlineMatch[3]) : null;

			const nameMatch = trimmedDef.match(new RegExp(`CONSTRAINT\\s+(${ident})`, 'i'));

			results.push({
				name: nameMatch ? cleanIdentifier(nameMatch[1]) : null,
				fromTable: fromTable,
				toTable: toTable,
				fromColumns: [fromColumn],
				toColumns: toColumn ? [toColumn] : [],
			});
		}
	}

	return results;
}

// for integer mode timestamp | timestamp_ms
function compareIntegerTimestamps(from: string, to: string): boolean {
	from = trimChar(trimChar(from, "'"), '"');
	to = trimChar(trimChar(to, "'"), '"');

	const mappedFrom: number | string = /^\d+$/.test(from) ? Number(from) : from;
	const mappedTo: number | string = /^\d+$/.test(to) ? Number(to) : to;

	let timestampFrom = new Date(mappedFrom).getTime();
	let timestampTo = new Date(mappedTo).getTime();
	if (timestampFrom === timestampTo) return true;

	if (typeof mappedFrom === 'number') {
		timestampFrom = new Date(Number(from) * 1000).getTime();

		return timestampFrom === timestampTo;
	}

	if (typeof mappedTo === 'number') {
		timestampTo = new Date(Number(to) * 1000).getTime();

		return timestampFrom === timestampTo;
	}

	return false;
}
// for legacy blobs
function parseToHex(value: string | null) {
	if (!value) return null;

	try {
		const parsed: any = JSON.parse(trimChar(value, "'"));
		if (parsed.type === 'Buffer' && Array.isArray(parsed.data)) {
			value = Blob.defaultFromDrizzle(Buffer.from(parsed.data));
		}
	} catch {}

	return value;
}
export const defaultsCommutative = (
	diffDef: DiffEntities['columns']['default'],
	type: string,
): boolean => {
	if (!diffDef) return false;

	let from = diffDef.from;
	let to = diffDef.to;

	if (from === to) return true;
	if (from === `(${to})`) return true;
	if (to === `(${from})`) return true;

	if (type.startsWith('integer')) {
		if (from && to) {
			// old snapshot has '"<iso_date>"'

			return compareIntegerTimestamps(from, to);
		}

		return false;
	}

	if (type.startsWith('blob')) {
		return parseToHex(from) === parseToHex(to);
	}

	return false;
};

export const transformOnUpdateDelete = (on: 'no action' | 'cascade' | 'restrict' | 'set default' | 'set null') => {
	if (on === 'no action') return 'NO ACTION';
	if (on === 'cascade') return 'CASCADE';
	if (on === 'restrict') return 'RESTRICT';
	if (on === 'set default') return 'SET DEFAULT';
	if (on === 'set null') return 'SET NULL';

	assertUnreachable(on);
};
