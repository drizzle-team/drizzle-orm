import type { RunResult } from 'better-sqlite3';
import type { ProxyParams } from '../cli/commands/studio';
import type { Config } from '../index';
import type { Dialect } from './schemaValidator';

export const originUUID = '00000000-0000-0000-0000-000000000000';
export const BREAKPOINT = '--> statement-breakpoint\n';

export function assertUnreachable(x: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

// don't fail in runtime, types only
export function softAssertUnreachable(x: never) {
	return null as never;
}

export const mapEntries = <T>(
	obj: Record<string, T>,
	map: (key: string, value: T) => [string, T],
): Record<string, T> => {
	const result = Object.fromEntries(
		Object.entries(obj).map(([key, val]) => {
			const [newKey, newVal] = map(key, val);
			return [newKey, newVal];
		}),
	);
	return result;
};

export type Proxy = (params: ProxyParams) => Promise<any[]>;
export type TransactionProxy = (queries: { sql: string; method?: ProxyParams['method'] }[]) => Promise<any[]>;

export type DB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
};

export type SQLiteDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
};

export type LibSQLDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
	batchWithPragma?(queries: string[]): Promise<void>;
};

export type Simplify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

export type Journal = {
	version: string;
	dialect: Dialect;
	entries: {
		idx: number;
		version: string;
		when: number;
		tag: string;
		breakpoints: boolean;
	}[];
};

export const kloudMeta = () => {
	return {
		pg: [5],
		mysql: [] as number[],
		sqlite: [] as number[],
	};
};

export function escapeSingleQuotes(str: string) {
	return str.replace(/'/g, "''");
}

export function unescapeSingleQuotes(str: string, ignoreFirstAndLastChar: boolean) {
	const regex = ignoreFirstAndLastChar ? /(?<!^)'(?!$)/g : /'/g;
	return str.replace(/''/g, "'").replace(regex, "\\'");
}

export const getTablesFilterByExtensions = ({
	extensionsFilters,
	dialect,
}: Pick<Config, 'extensionsFilters' | 'dialect'>): string[] => {
	if (!extensionsFilters) return [];

	if (
		extensionsFilters.includes('postgis')
		&& dialect === 'postgresql'
	) {
		return ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'];
	}
	return [];
};

export const prepareMigrationRenames = (
	renames: {
		from: { schema?: string; table?: string; name: string };
		to: { schema?: string; table?: string; name: string };
	}[],
) => {
	return renames.map((it) => {
		const schema1 = it.from.schema ? `${it.from.schema}.` : '';
		const schema2 = it.to.schema ? `${it.to.schema}.` : '';

		const table1 = it.from.table ? `${it.from.table}.` : '';
		const table2 = it.to.table ? `${it.to.table}.` : '';

		return `${schema1}${table1}${it.from.name}->${schema2}${table2}${it.to.name}`;
	});
};

export type ArrayValue = unknown | null | ArrayValue[];

export function stringifyArray(
	value: ArrayValue,
	mode: 'sql' | 'ts' | 'geometry-sql',
	mapCallback: (v: any | null, depth: number) => string,
	depth: number = 0,
): string {
	if (!Array.isArray(value)) return mapCallback(value, depth);
	depth += 1;
	const res = value.map((e) => {
		if (Array.isArray(e)) return stringifyArray(e, mode, mapCallback, depth);
		return mapCallback(e, depth);
	}).join(',');
	return mode === 'ts' ? `[${res}]` : mode === 'geometry-sql' ? `ARRAY['${res}']` : `{${res}}`;
}

export function stringifyTuplesArray(
	array: ArrayValue[],
	mode: 'sql' | 'ts' | 'geometry-sql',
	mapCallback: (v: ArrayValue, depth: number) => string,
	depth: number = 0,
): string {
	if (!array.find((n) => Array.isArray(n))) return mapCallback(array, depth);

	depth += 1;
	const res = array.map((e) => {
		if (Array.isArray(e) && e.find((n) => Array.isArray(n))) {
			return stringifyTuplesArray(e, mode, mapCallback, depth);
		}
		return mapCallback(e, depth);
	}).join(',');
	return mode === 'ts' ? `[${res}]` : mode === 'geometry-sql' ? `ARRAY[${res}]` : `{${res}}`;
}

export const trimChar = (str: string, char: string | [string, string]) => {
	if (str.length < 2) return str;
	if (typeof char === 'string' && str.startsWith(char) && str.endsWith(char)) return str.substring(1, str.length - 1);
	if (Array.isArray(char) && str.startsWith(char[0]) && str.endsWith(char[1])) return str.substring(1, str.length - 1);

	return str;
};

export const splitExpressions = (input: string | null): string[] => {
	if (!input) return [];

	const expressions: string[] = [];
	let parenDepth = 0;
	let inSingleQuotes = false;
	let inDoubleQuotes = false;
	let currentExpressionStart = 0;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (char === "'" && input[i + 1] === "'") {
			i++;
			continue;
		}

		if (char === '"' && input[i + 1] === '"') {
			i++;
			continue;
		}

		if (char === "'") {
			if (!inDoubleQuotes) {
				inSingleQuotes = !inSingleQuotes;
			}
			continue;
		}
		if (char === '"') {
			if (!inSingleQuotes) {
				inDoubleQuotes = !inDoubleQuotes;
			}
			continue;
		}

		if (!inSingleQuotes && !inDoubleQuotes) {
			if (char === '(') {
				parenDepth++;
			} else if (char === ')') {
				parenDepth = Math.max(0, parenDepth - 1);
			} else if (char === ',' && parenDepth === 0) {
				expressions.push(input.substring(currentExpressionStart, i).trim());
				currentExpressionStart = i + 1;
			}
		}
	}

	if (currentExpressionStart < input.length) {
		expressions.push(input.substring(currentExpressionStart).trim());
	}

	return expressions.filter((s) => s.length > 0);
};

export const wrapWith = (it: string, char: string) => {
	if (!it.startsWith(char) || !it.endsWith(char)) return `${char}${it}${char}`;
	return it;
};

export const timeTzRegex = /\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?/;
export const isTime = (it: string) => {
	return timeTzRegex.test(it);
};

export const dateExtractRegex = /^\d{4}-\d{2}-\d{2}/;
export const isDate = (it: string) => {
	return dateExtractRegex.test(it);
};

export const possibleIntervals = [
	'year',
	'month',
	'day',
	'hour',
	'minute',
	'second',
	'year to month',
	'day to hour',
	'day to minute',
	'day to second',
	'hour to minute',
	'hour to second',
	'minute to second',
];
export function parseIntervalFields(type: string): { fields?: typeof possibleIntervals[number]; precision?: number } {
	const options: { precision?: number; fields?: typeof possibleIntervals[number] } = {};
	// incoming: interval day to second(3)

	// [interval, day, to, second(3)]
	const splitted = type.split(' ');
	if (splitted.length === 1) {
		return options;
	}

	// [day, to, second(3)]
	// day to second(3)
	const rest = splitted.slice(1, splitted.length).join(' ');
	if (possibleIntervals.includes(rest)) return { ...options, fields: rest };

	// day to second(3)
	for (const s of possibleIntervals) {
		if (rest.startsWith(`${s}(`)) return { ...options, fields: s };
	}

	return options;
}
