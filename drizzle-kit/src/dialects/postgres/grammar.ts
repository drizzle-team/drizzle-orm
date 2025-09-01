import { parseEWKB } from 'drizzle-orm/pg-core/columns/postgis_extension/utils';

import { parse, stringify } from 'src/utils/when-json-met-bigint';
import {
	isDate,
	isTime,
	parseIntervalFields,
	possibleIntervals,
	stringifyArray,
	stringifyTuplesArray,
	trimChar,
	wrapWith,
} from '../../utils';
import { parseArray } from '../../utils/parse-pgarray';
import { hash } from '../common';
import { escapeForSqlDefault, escapeForTsLiteral, numberForTs, parseParams, unescapeFromSqlDefault } from '../utils';
import type { Column, PostgresEntities } from './ddl';
import type { Import } from './typescript';

export interface SqlType {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle<MODE = unknown>(value: unknown, mode?: MODE, config?: unknown): Column['default'];
	defaultArrayFromDrizzle<MODE = unknown>(
		value: any[],
		dimensions: number,
		mode?: MODE,
		config?: unknown,
	): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	defaultArrayFromIntrospect(value: string): Column['default']; // todo: remove?
	toTs(type: string, value: string | null): { options?: Record<string, unknown>; default: string; customType?: string }; // customType for Custom
	toArrayTs(
		type: string,
		value: string | null,
	): { options?: Record<string, unknown>; default: string; customType?: string };
}

export const SmallInt: SqlType = {
	is: (type: string) => /^\s*smallint(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'smallint',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: trimChar(value, "'"), type: 'unknown' }; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (_, value) => ({ default: value ?? '' }),
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `${v}`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Int: SqlType = {
	is: (type: string) => /^\s*integer(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'integer',
	defaultFromDrizzle: SmallInt.defaultFromDrizzle,
	defaultArrayFromDrizzle: SmallInt.defaultArrayFromDrizzle,
	defaultFromIntrospect: SmallInt.defaultFromIntrospect,
	defaultArrayFromIntrospect: SmallInt.defaultArrayFromIntrospect,
	toTs: SmallInt.toTs,
	toArrayTs: SmallInt.toArrayTs,
};

export const BigInt: SqlType = {
	is: (type: string) => /^\s*bigint(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'bigint',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return {
			value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value) => {
		return { value: trimChar(value, "'"), type: 'unknown' }; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	toTs: (_, value) => {
		if (!value) return { options: { mode: 'number' }, default: '' };
		const { mode, value: def } = numberForTs(value);
		return { options: { mode }, default: def };
	},
	toArrayTs: (_, value) => {
		if (!value) return { options: { mode: 'number' }, default: '' };
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);
			return { options: { mode: 'bigint' }, default: stringifyArray(res, 'ts', (v) => `${v}n`) };
		} catch {
			return { options: { mode: 'bigint' }, default: `sql\`${value}\`` };
		}
	},
};

export const Numeric: SqlType = {
	is: (type: string) => /^\s*numeric|decimal(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'numeric',
	defaultFromDrizzle: (value) => {
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return {
			value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value) => {
		// 10.123, but '9223372036854775807'
		return { value: `'${trimChar(value, "'")}'`, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	toTs: (type, value) => {
		const [precision, scale] = parseParams(type);
		const options = {} as any;
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };

		const trimmed = trimChar(value, "'");

		const { mode, value: def } = numberForTs(trimmed);
		return { options: { mode, ...options }, default: def };
	},
	toArrayTs: (type, value) => {
		const [precision, scale] = parseParams(type);
		const options = {} as any;
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };
		/*
			If we'd want it to be smart - we need to check if numeric array has
			any bigints recuresively, it's waaaaay easier to just do sql``
		 */
		// try {
		// 	const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
		// 	const res = parseArray(trimmed);

		// 	return {
		// 		options: { mode: 'bigint', ...options },
		// 		default: stringifyArray(res, 'ts', (v) => {

		// 			return `${v}`;
		// 		}),
		// 	};
		// } catch {
		return { options, default: `sql\`${value}\`` };
		// }
	},
};

export const Real: SqlType = {
	is: (type: string) => /^\s*real(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'real',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: trimChar(value, "'"), type: 'unknown' }; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (_, value) => ({ default: value ?? '' }),
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `${v}`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Double: SqlType = {
	is: (type: string) => /^\s*(?:double|double precision)(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'doublePrecision',
	defaultFromDrizzle: Real.defaultFromDrizzle,
	defaultArrayFromDrizzle: Real.defaultArrayFromDrizzle,
	defaultFromIntrospect: Real.defaultFromIntrospect,
	defaultArrayFromIntrospect: Real.defaultArrayFromIntrospect,
	toTs: Real.toTs,
	toArrayTs: Real.toArrayTs,
};

export const Boolean: SqlType = {
	is: (type: string) => /^\s*boolean(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'boolean',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => v === true ? 't' : 'f')}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: trimChar(value, "'"), type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (_, value) => ({ default: value ?? '' }),
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return v === 't' ? 'true' : 'false';
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Char: SqlType = {
	is: (type: string) => /^\s*char|character(?:\(\d+\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'char',
	defaultFromDrizzle: (value) => {
		const escaped = escapeForSqlDefault(value as string);
		return { value: `'${escaped}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				const escaped = v.replaceAll("'", "''").replaceAll('\\', '\\\\').replaceAll('"', '\\"');
				if (v.includes('\\') || v.includes('"') || v.includes(',')) return `"${escaped}"`;
				return escaped;
			},
		);
		return { value: `'${res}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };
		const escaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(value, "'")));
		return { options, default: `"${escaped}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					const escaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(v, "'"), 'arr'));
					return `"${escaped}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Varchar: SqlType = {
	is: (type: string) => /^\s*varchar|character varying(?:\(\d+\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'varchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultArrayFromDrizzle: Char.defaultArrayFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultArrayFromIntrospect: Char.defaultArrayFromIntrospect,
	toTs: Char.toTs,
	toArrayTs: Char.toArrayTs,
};

export const Text: SqlType = {
	is: (type: string) => /^\s*text(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'text',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultArrayFromDrizzle: Char.defaultArrayFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultArrayFromIntrospect: Char.defaultArrayFromIntrospect,
	toTs: Char.toTs,
	toArrayTs: Char.toArrayTs,
};

export const toDefaultArray = (
	value: any[],
	dimensions: number,
	cb: (it: unknown) => string,
	depth: number = 0,
): string => {
	if (depth === dimensions) {
		const res = cb(value);
		if (res.includes('"')) return `"${res.replaceAll('"', '\\"')}"`;
		return `"${res}"`;
	}

	if (Array.isArray(value)) {
		const inner = value.map((v) => {
			return toDefaultArray(v, dimensions, cb, depth + 1);
		}).join(',');
		if (depth === 0) return `{${inner}}`;
		return `${inner}`;
	}

	return cb(value);
};

export const Json: SqlType = {
	is: (type: string) => /^\s*json(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'json',
	defaultFromDrizzle: (value) => {
		const stringified = stringify(value, (_, value) => {
			if (typeof value !== 'string') return value;
			return value.replaceAll("'", "''");
		});
		return { type: 'unknown', value: `'${stringified}'` };
	},
	defaultArrayFromDrizzle: (def, dimensions) => {
		const value = toDefaultArray(def, dimensions, (it) =>
			stringify(it, (_, value) => {
				if (typeof value !== 'string') return value;
				return value.replaceAll("'", "''");
			}));
		return { type: 'unknown', value: `'${value}'` };
	},
	defaultFromIntrospect: (value) => ({ type: 'unknown', value }),
	defaultArrayFromIntrospect: (value) => {
		return { type: 'unknown', value: value };
	},
	toTs: (_, value) => {
		if (!value) return { default: '' };

		const trimmed = trimChar(value, "'");
		try {
			const parsed = parse(trimmed);
			const stringified = stringify(
				parsed,
				(_, value) => {
					if (typeof value !== 'string') return value;
					return value.replaceAll("''", "'");
				},
				undefined,
				true,
			)!;
			return { default: stringified };
		} catch {}
		return { default: `sql\`${value}\`` };
	},
	toArrayTs: (_, def) => {
		if (!def) return { default: '' };
		return { default: `sql\`${def.replaceAll('\\"', '\\\\"')}\`` };
	},
};

export const Jsonb: SqlType = {
	is: (type: string) => /^\s*jsonb(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'jsonb',
	defaultFromDrizzle: (value) => {
		const stringified = stringify(
			value,
			(_, value) => {
				if (typeof value !== 'string') return value;
				return value.replaceAll("'", "''");
			},
		);
		return { type: 'unknown', value: `'${stringified}'` };
	},
	defaultArrayFromDrizzle: Json.defaultArrayFromDrizzle,
	/*
		TODO: make less hacky,
		from: { type: 'unknown', value: `'{"key": "value"}'` },
		to:   { type: 'unknown', value: `'{"key":"value"}'` }
	 */
	defaultFromIntrospect: (value) => ({ type: 'unknown', value: value.replaceAll(`": "`, `":"`) }),
	defaultArrayFromIntrospect: Json.defaultArrayFromIntrospect,
	toTs: Json.toTs,
	toArrayTs: Json.toArrayTs,
};

export const Time: SqlType = {
	is: (type: string) => /^\s*time(?:\(\d+\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'time',
	defaultFromDrizzle: (value) => {
		return { value: wrapWith(String(value), "'"), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: wrapWith(stringifyArray(value, 'sql', (v) => String(v)), "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		if (/with time zone/i.test(type)) options['withTimezone'] = true;

		if (!value) return { options, default: '' };
		const trimmed = trimChar(value, "'");
		if (!isTime(trimmed)) return { options, default: `sql\`${value}\`` };

		return { options, default: value };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		if (/with time zone/i.test(type)) options['withTimezone'] = true;

		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);
			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					const trimmed = trimChar(v, "'");

					if (!isTime(trimmed)) return `sql\`${trimmed}\``;
					return wrapWith(v, "'");
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const DateType: SqlType = {
	is: (type: string) => /^\s*date(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'date',
	defaultFromDrizzle: (value) => {
		if (typeof value === 'string') return { value: wrapWith(value, "'"), type: 'unknown' };
		if (!(value instanceof Date)) throw new Error('"date" default value must be instance of Date or String');

		const mapped = value.toISOString().split('T')[0];
		return { value: wrapWith(mapped, "'"), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v === 'string') return v;
			if (v instanceof Date) {
				return v.toISOString().split('T')[0];
			}
			throw new Error('Unexpected default value for "date", must be String or Date');
		});
		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		if (!value) return { default: '' };
		const trimmed = trimChar(value, "'");
		if (!isDate(trimmed)) return { default: `sql\`${value}\`` };

		return { default: value };
	},
	toArrayTs: (type, value) => {
		if (!value) return { default: '' };

		let isDrizzleSql: boolean = false;
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);
			const mapped = stringifyArray(res, 'ts', (v) => {
				const trimmed = trimChar(v, "'");

				if (!isDate(trimmed)) isDrizzleSql = true;
				return wrapWith(v, "'");
			});
			return {
				default: isDrizzleSql ? mapped : `sql\`${value}\``,
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Timestamp: SqlType = {
	// TODO
	// ORM returns precision with space before type, why?
	// timestamp or timestamp[] or timestamp (3) or timestamp (3)[]
	is: (type: string) => /^\s*timestamp(?:\s)?(?:\(\d+\))?(?:\[\])?\s*$/i.test(type),
	drizzleImport: () => 'timestamp',
	defaultFromDrizzle: (value, type) => {
		if (typeof value === 'string') return { value: wrapWith(value, "'"), type: 'unknown' };
		if (!(value instanceof Date)) throw new Error('Timestamp default value must be instance of Date or String');

		const mapped = value.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23);
		return { value: wrapWith(mapped, "'"), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value, type) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v === 'string') return wrapWith(v, '"');
			if (v instanceof Date) {
				return wrapWith(v.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23), '"');
			}
			throw new Error('Unexpected default value for Timestamp, must be String or Date');
		});
		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);

		if (!value) return { options, default: '' };
		let patched = trimChar(value, "'");
		patched = patched.includes('T') ? patched : patched.replace(' ', 'T') + 'Z';

		const test = new Date(patched);

		if (isNaN(test.getTime())) return { options, default: `sql\`${value}\`` };

		return { options, default: `new Date('${patched}')` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);

		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);
			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					const trimmed = trimChar(v, "'");
					const check = new Date(trimmed);
					if (!isNaN(check.getTime())) return `new Date("${trimmed}")`;
					return `sql\`${trimmed}\``;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};
export const TimestampTz: SqlType = {
	// TODO
	// ORM returns precision with space before type, why?
	// timestamp with time zone or timestamp with time zone[] or timestamp (3) with time zone or timestamp (3) with time zone[]
	is: (type: string) => /^\s*timestamp(?:\s)?(?:\(\d+\))?\s+with time zone(?:\[\])?\s*$/i.test(type),
	drizzleImport: () => 'timestamp',
	defaultFromDrizzle: (value, type) => {
		if (typeof value === 'string') return { value: wrapWith(value, "'"), type: 'unknown' };
		if (!(value instanceof Date)) throw new Error('Timestamp default value must be instance of Date or String');

		const mapped = value.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23) + '+00';
		return { value: wrapWith(mapped, "'"), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value, type) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v === 'string') return v;
			if (v instanceof Date) {
				return wrapWith(v.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23) + '+00', '"');
			}
			throw new Error('Unexpected default value for Timestamp, must be String or Date');
		});
		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		options['withTimezone'] = true;

		if (!value) return { options, default: '' };
		let patched = trimChar(value, "'");

		const test = new Date(patched);

		if (isNaN(test.getTime())) return { options, default: `sql\`${value}\`` };

		return { options, default: `new Date('${patched}')` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		options['withTimezone'] = true;

		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);
			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					const trimmed = trimChar(v, "'");
					const check = new Date(trimmed);
					if (!isNaN(check.getTime())) return `new Date("${trimmed}")`;
					return `sql\`${trimmed}\``;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Uuid: SqlType = {
	is: (type: string) => /^\s*uuid(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'uuid',
	defaultFromDrizzle: (value) => {
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v !== 'string') throw new Error();
			return v;
		});
		return { value: `'${res}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		value = trimChar(value, "'");
		if (value === 'gen_random_uuid()') return { options, default: '.defaultRandom()' };
		return { options, default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Interval: SqlType = {
	is: (type: string) =>
		/^interval(\s+(year|month|day|hour|minute|second)(\s+to\s+(month|day|hour|minute|second))?)?(?:\((\d+)\))?(?:\s*\[\s*\])*\s*$/i
			.test(type),
	drizzleImport: () => 'interval',
	defaultFromDrizzle: (value) => {
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				return `"${v}"`;
			},
		);

		return { value: `'${res}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: { precision?: number; fields?: typeof possibleIntervals[number] } = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		const fields = parseIntervalFields(type);
		if (fields.fields) options['fields'] = fields.fields;

		if (!value) return { options, default: '' };

		return { options, default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		const fields = parseIntervalFields(type);
		if (fields.fields) options['fields'] = fields.fields;

		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Inet: SqlType = {
	is: (type: string) =>
		/^inet(?:\((\d+)\))?(\[\])?$/i
			.test(type),
	drizzleImport: () => 'inet',
	defaultFromDrizzle: (value) => {
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				return v;
			},
		);

		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (_, value) => {
		if (!value) return { default: '' };
		return { default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Cidr: SqlType = {
	is: (type: string) =>
		/^cidr(?:\((\d+)\))?(\[\])?$/i
			.test(type),
	drizzleImport: () => 'cidr',
	defaultFromDrizzle: (value) => {
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				return v;
			},
		);

		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (_, value) => {
		if (!value) return { default: '' };
		return { default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const MacAddr: SqlType = {
	is: (type: string) =>
		/^macaddr(?:\s*\[\s*\])*\s*$/i
			.test(type),
	drizzleImport: () => 'macaddr',
	defaultFromDrizzle: (value) => {
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				return v;
			},
		);

		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (_, value) => {
		if (!value) return { default: '' };
		return { default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};
export const MacAddr8: SqlType = {
	is: (type: string) =>
		/^macaddr8(?:\s*\[\s*\])*\s*$/i
			.test(type),
	drizzleImport: () => 'macaddr8',
	defaultFromDrizzle: MacAddr.defaultFromDrizzle,
	defaultArrayFromDrizzle: MacAddr.defaultArrayFromDrizzle,
	defaultFromIntrospect: MacAddr.defaultFromIntrospect,
	defaultArrayFromIntrospect: MacAddr.defaultArrayFromIntrospect,
	toTs: MacAddr.toTs,
	toArrayTs: MacAddr.toArrayTs,
};

export const Vector: SqlType = {
	is: (type: string) => /^\s*vector(?:\(\d+\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'vector',
	defaultFromDrizzle: (value) => {
		return { value: `'[${String(value).replaceAll(' ', '')}]'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value, dimensions) => {
		const res = stringifyTuplesArray(
			value,
			'sql',
			(v: number[]) => {
				const res = v.length > 0 ? `"[${String(v).replaceAll(' ', '')}]"` : '"[]"';
				return res;
			},
		);

		return { value: wrapWith(res.replaceAll(' ', ''), "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: { dimensions?: number } = {};
		const [dimensions] = parseParams(type);
		if (dimensions) options['dimensions'] = Number(dimensions);

		if (!value) return { options, default: '' };

		return { options, default: trimChar(value, "'") };
	},
	toArrayTs: (type, value) => {
		const options: { dimensions?: number } = {};
		const [dimensions] = parseParams(type);
		if (dimensions) options['dimensions'] = Number(dimensions);
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return v;
				}, Number(dimensions)),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};
export const HalfVec: SqlType = {
	is: (type: string) => /^\s*halfvec(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'halfvec',
	defaultFromDrizzle: Vector.defaultFromDrizzle,
	defaultArrayFromDrizzle: Vector.defaultArrayFromDrizzle,
	defaultFromIntrospect: Vector.defaultFromIntrospect,
	defaultArrayFromIntrospect: Vector.defaultArrayFromIntrospect,
	toTs: Vector.toTs,
	toArrayTs: Vector.toArrayTs,
};
export const SparseVec: SqlType = {
	is: (type: string) => /^\s*sparsevec(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'sparsevec',
	defaultFromDrizzle: (value) => {
		return { value: wrapWith(String(value), "'"), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				return `"${String(v).replaceAll(' ', '')}"`;
			},
		);

		return { value: wrapWith(res, "'"), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: { dimensions?: number } = {};
		const [dimensions] = parseParams(type);
		if (dimensions) options['dimensions'] = Number(dimensions);

		if (!value) return { options, default: '' };

		return { options, default: value };
	},
	toArrayTs: (type, value) => {
		const options: { dimensions?: number } = {};
		const [dimensions] = parseParams(type);
		if (dimensions) options['dimensions'] = Number(dimensions);
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return wrapWith(v, "'");
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Bit: SqlType = {
	is: (type: string) => /^\s*bit(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'bit',
	defaultFromDrizzle: (value, _) => {
		return { type: 'unknown', value: `'${value}'` };
	},
	defaultArrayFromDrizzle: (value, type) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const [dimensions] = parseParams(type);
		const options = dimensions ? { dimensions: Number(dimensions) } : {};

		if (!value) return { options, default: '' };

		if (/^'[01]+'$/.test(value)) {
			return { options, default: value };
		}

		return { options, default: `sql\`${value}\`` };
	},
	toArrayTs: (type, value) => {
		const [dimensions] = parseParams(type);
		const options = dimensions ? { dimensions: Number(dimensions) } : {};

		if (!value) return { default: '' };

		let isDrizzleSql: boolean = false;
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			const def = stringifyArray(res, 'ts', (v) => {
				if (!/^[01]+$/.test(v)) isDrizzleSql = true;
				return `"${v}"`;
			});

			return {
				options,
				default: isDrizzleSql ? `sql\`${value}\`` : def,
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Point: SqlType = {
	is: (type: string) => /^\s*point(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'point',
	defaultFromDrizzle: (value, mode) => {
		if (!value) return { type: 'unknown', value: '' };

		if (mode === 'xy') {
			const v: { x: number; y: number } = value as { x: number; y: number };
			return { type: 'unknown', value: Object.values(v).length > 0 ? `'(${v.x},${v.y})'` : '' };
		}
		if (mode === 'tuple') {
			const v: number[] = value as number[];
			return { type: 'unknown', value: v.length > 0 ? `'(${v[0]},${v[1]})'` : '' };
		}

		throw new Error('unknown point type');
	},
	defaultArrayFromDrizzle: function(value: any[], dimensions: number, mode): Column['default'] {
		let res;

		if (mode === 'tuple') {
			res = stringifyTuplesArray(value, 'sql', (x: number[]) => {
				const res = x.length > 0 ? `(${x[0]},${x[1]})` : '{}';
				return `"${res}"`;
			});
		} else if (mode === 'xy') {
			res = stringifyArray(value, 'sql', (x: { x: number; y: number }, depth: number) => {
				const res = Object.values(x).length > 0 ? `(${x.x},${x.y})` : '{}';
				return `"${res}"`;
			});
		} else throw new Error('unknown point type');

		return { type: 'unknown', value: wrapWith(res, "'") };
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: function(value: string): Column['default'] {
		return { value: value, type: 'unknown' };
	},
	toTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		if (!value) return { default: '' };

		if (/^'\(\d+,\d+\)'$/.test(value)) {
			return { default: trimChar(value, "'").replace('(', '[').replace(')', ']'), options: {} };
		}

		return { default: `sql\`${value}\``, options: {} };
	},
	toArrayTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		if (!value) return { default: '' };

		let isDrizzleSql: boolean = false;
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			const def = stringifyArray(res, 'ts', (v) => {
				if (!/^\(\d+,\d+\)$/.test(v)) isDrizzleSql = true;
				return v.replace('(', '[').replace(')', ']');
			});

			return {
				default: isDrizzleSql ? `sql\`${value}\`` : def,
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Line: SqlType = {
	is: (type: string) => /^\s*line(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'line',
	defaultFromDrizzle: (value, mode) => {
		if (!value) return { type: 'unknown', value: '' };

		if (mode === 'tuple') {
			const v: number[] = value as number[];
			return { type: 'unknown', value: v.length > 0 ? `'{${v[0]},${v[1]},${v[2]}}'` : '' };
		}

		if (mode === 'abc') {
			const v: { a: number; b: number; c: number } = value as { a: number; b: number; c: number };
			return { type: 'unknown', value: Object.values(v).length > 0 ? `'{${v.a},${v.b},${v.c}}'` : '' };
		}

		throw new Error('unknown line type');
	},
	defaultArrayFromDrizzle: function(value: any[], dimensions: number, mode): Column['default'] {
		let res;

		if (mode === 'tuple') {
			res = stringifyTuplesArray(value, 'sql', (x: number[]) => {
				const res = x.length > 0 ? `{${x[0]},${x[1]},${x[2]}}` : '{}';
				return `"${res}"`;
			});
		} else if (mode === 'abc') {
			res = stringifyArray(value, 'sql', (x: { a: number; b: number; c: number }, depth: number) => {
				const res = Object.values(x).length > 0 ? `{${x.a},${x.b},${x.c}}` : '{}';
				return `"${res}"`;
			});
		} else throw new Error('unknown line type');

		return { type: 'unknown', value: wrapWith(res, "'") };
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: function(value: string): Column['default'] {
		return { value: value, type: 'unknown' };
	},
	toTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		if (!value) return { default: '' };

		if (/^'\{\d+,\d+,\d+\}'$/.test(value)) {
			return { default: trimChar(value, "'").replace('{', '[').replace('}', ']'), options: {} };
		}

		return { default: `sql\`${value}\``, options: {} };
	},
	toArrayTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		if (!value) return { default: '' };

		let isDrizzleSql: boolean = false;
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			const def = stringifyArray(res, 'ts', (v) => {
				if (!/^\(\d+,\d+,\d+\)$/.test(v)) isDrizzleSql = true;
				return v.replace('{', '[').replace('}', ']');
			});

			return {
				default: isDrizzleSql ? `sql\`${value}\`` : def,
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

// TODO WIP
export const GeometryPoint: SqlType = {
	is: (type: string) => /^\s*geometry\(point\)(?:\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'geometry',
	defaultFromDrizzle: (value, mode, config) => {
		if (!value) return { type: 'unknown', value: '' };

		const srid: number | undefined = config ? Number(config) : undefined;
		let sridPrefix = srid ? `SRID=${srid};` : '';
		if (mode === 'tuple') {
			const v: number[] = value as number[];
			return { type: 'unknown', value: v.length > 0 ? `'${sridPrefix}POINT(${v[0]} ${v[1]})'` : '' };
		}

		if (mode === 'object') {
			const v: { x: number; y: number } = value as { x: number; y: number };
			return { type: 'unknown', value: Object.values(v).length > 0 ? `'${sridPrefix}POINT(${v.x} ${v.y})'` : '' };
		}

		throw new Error('unknown geometry type');
	},
	defaultArrayFromDrizzle: function(value: any[], dimensions: number, mode, config): Column['default'] {
		// Parse to ARRAY[ ::text]
		let res;
		const srid: number | undefined = config ? Number(config) : undefined;
		let sridPrefix = srid ? `SRID=${srid};` : '';
		if (mode === 'tuple') {
			res = stringifyTuplesArray(value, 'geometry-sql', (x: number[]) => {
				const res = `${sridPrefix}POINT(${x[0]} ${x[1]})::text`;
				return `'${res}'::text`;
			});
		} else if (mode === 'object') {
			res = stringifyArray(value, 'geometry-sql', (x: { x: number; y: number }, depth: number) => {
				const res = `${sridPrefix}POINT(${x.x} ${x.y})`;
				return `'${res}'::text`;
			});
		} else throw new Error('unknown geometry type');

		return { type: 'unknown', value: res };
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		let def: string;

		try {
			const { srid, point } = parseEWKB(trimChar(value, "'"));
			let sridPrefix = srid ? `SRID=${srid};` : '';
			def = `'${sridPrefix}POINT(${point} ${point})'`;
		} catch (e) {
			def = value;
		}

		return { value: def, type: 'unknown' };
	},
	defaultArrayFromIntrospect: function(value: string): Column['default'] {
		// If {} array - parse to ARRAY[ ::text]

		let def = value;
		if (value.startsWith('{') && value.endsWith('}')) {
			def = stringifyArray(value, 'geometry-sql', (v) => {
				try {
					const { srid, point } = parseEWKB(v);
					let sridPrefix = srid ? `SRID=${srid};` : '';
					return `${sridPrefix}POINT(${point[0]} ${point[1]})::text`;
				} catch (e) {
					return v;
				}
			});
		}

		return { type: 'unknown', value: def };
	},
	toTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		if (!value) return { default: '' };

		const options: { srid?: number; type: 'point' } = { type: 'point' };

		value = trimChar(value, "'");

		// SRID=4326;POINT(30.5234 50.4501) OR '0101000020E6100000F5B9DA8AFD853E40FDF675E09C394940'
		if (!value.includes('POINT(')) return { default: `sql\`${value}\``, options };

		const srid: string | undefined = value.split('SRID=')[1]?.split(';')[0];
		options.srid = srid ? Number(srid) : undefined;

		const [res1, res2] = value.split('POINT(')[1].split(')')[0].split(' ');

		return { default: `[${res1},${res2}]`, options };
	},
	toArrayTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		if (!value) return { default: '' };

		const options: { srid?: number; type: 'point' } = { type: 'point' };

		return {
			default: `sql\`${value}\``,
			options,
		};
	},
};

export const Enum: SqlType = {
	is: (type: string) => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'pgEnum',
	defaultFromDrizzle: (value) => {
		if (!value) return { value: '', type: 'unknown' };
		const escaped = (value as string).replaceAll("'", "''");
		return { value: `'${escaped}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				const escaped = escapeForSqlDefault(v, 'pg-arr');
				if (v.includes('\\') || v.includes('"') || v.includes(',')) return `"${escaped}"`;
				return escaped;
			},
		);
		return { value: `'${res}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };
		const escaped = escapeForTsLiteral(trimChar(value, "'").replaceAll("''", "'"));
		return { options, default: `"${escaped}"` };
	},
	toArrayTs: (type, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					const escaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(v, "'")));
					return `"${escaped}"`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Serial: SqlType = {
	is: (type: string) => /^(?:serial)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'serial',
	defaultFromDrizzle: (value) => {
		throw new Error(`Unexpected default for serial type: ${value}`);
	},
	defaultArrayFromDrizzle: (v) => {
		throw new Error(`Unexpected default for serial type: ${v}`);
	},
	defaultFromIntrospect: (value) => {
		return { type: 'unknown', value };
	},
	defaultArrayFromIntrospect: function(value: string): Column['default'] {
		return { type: 'unknown', value };
	},
	toTs: () => {
		return { default: '' };
	},
	toArrayTs: () => {
		return { default: '' };
	},
};

export const BigSerial: SqlType = {
	is: (type: string) => /^(?:bigserial)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'bigserial',
	defaultFromDrizzle: Serial.defaultFromDrizzle,
	defaultArrayFromDrizzle: Serial.defaultArrayFromDrizzle,
	defaultFromIntrospect: Serial.defaultFromIntrospect,
	defaultArrayFromIntrospect: Serial.defaultArrayFromIntrospect,
	toTs: () => {
		return { options: { mode: 'number' }, default: '' };
	},
	toArrayTs: () => {
		return { options: { mode: 'number' }, default: '' };
	},
};
export const SmallSerial: SqlType = {
	is: (type: string) => /^(?:smallserial)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'smallserial',
	defaultFromDrizzle: Serial.defaultFromDrizzle,
	defaultArrayFromDrizzle: Serial.defaultArrayFromDrizzle,
	defaultFromIntrospect: Serial.defaultFromIntrospect,
	defaultArrayFromIntrospect: Serial.defaultArrayFromIntrospect,
	toTs: Serial.toTs,
	toArrayTs: Serial.toArrayTs,
};

export const Custom: SqlType = {
	is: (type: string) => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'customType',
	defaultFromDrizzle: (value) => {
		if (!value) return { value: '', type: 'unknown' };
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '', customType: type };
		const escaped = escapeForTsLiteral(value);
		return { default: `"${escaped}"`, customType: type };
	},
	toArrayTs: (type, value) => {
		if (!value) return { default: '', customType: type };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					const escaped = escapeForTsLiteral(v);
					return `"${escaped}"`;
				}),
				customType: type,
			};
		} catch {
			return { default: `sql\`${value}\``, customType: type };
		}
	},
};

export const typeFor = (type: string, isEnum: boolean): SqlType => {
	if (isEnum) return Enum;
	if (SmallInt.is(type)) return SmallInt;
	if (Int.is(type)) return Int;
	if (BigInt.is(type)) return BigInt;
	if (Numeric.is(type)) return Numeric;
	if (Real.is(type)) return Real;
	if (Double.is(type)) return Double;
	if (Boolean.is(type)) return Boolean;
	if (Char.is(type)) return Char;
	if (Varchar.is(type)) return Varchar;
	if (Text.is(type)) return Text;
	if (Json.is(type)) return Json;
	if (Jsonb.is(type)) return Jsonb;
	if (Time.is(type)) return Time;
	if (Timestamp.is(type)) return Timestamp;
	if (TimestampTz.is(type)) return TimestampTz;
	if (Uuid.is(type)) return Uuid;
	if (Interval.is(type)) return Interval;
	if (Inet.is(type)) return Inet;
	if (Cidr.is(type)) return Cidr;
	if (MacAddr.is(type)) return MacAddr;
	if (MacAddr8.is(type)) return MacAddr8;
	if (Vector.is(type)) return Vector;
	if (HalfVec.is(type)) return HalfVec;
	if (SparseVec.is(type)) return SparseVec;
	if (Bit.is(type)) return Bit;
	if (Point.is(type)) return Point;
	if (Line.is(type)) return Line;
	if (DateType.is(type)) return DateType;
	if (GeometryPoint.is(type)) return GeometryPoint;
	if (Serial.is(type)) return Serial;
	if (SmallSerial.is(type)) return SmallSerial;
	if (BigSerial.is(type)) return BigSerial;
	return Custom;
};

export const splitSqlType = (sqlType: string) => {
	// timestamp(6) with time zone -> [timestamp, 6, with time zone]
	const toMatch = sqlType.replaceAll('[]', '');
	const match = toMatch.match(/^(\w+(?:\s+\w+)*)\(([^)]*)\)(?:\s+with time zone)?$/i);
	let type = match ? (match[1] + (match[3] ?? '')) : toMatch;
	let options = match ? match[2].replaceAll(', ', ',') : null;

	return { type, options };
};

export const vectorOps = [
	'vector_l2_ops',
	'vector_ip_ops',
	'vector_cosine_ops',
	'vector_l1_ops',
	'bit_hamming_ops',
	'bit_jaccard_ops',
	'halfvec_l2_ops',
	'sparsevec_l2_ops',
];

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export function stringFromIdentityProperty(field: string | number | undefined): string | undefined {
	return typeof field === 'string' ? (field as string) : typeof field === 'undefined' ? undefined : String(field);
}

export function maxRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '2147483647' : columnType === 'bigint' ? '9223372036854775807' : '32767';
}

export function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '-2147483648' : columnType === 'bigint' ? '-9223372036854775808' : '-32768';
}

/*
	we can't check for `nextval('${schemaPrefix}${table}_${column}_seq'::regclass)` perfect match
	since table or column might be renamed, while sequence preserve name and it will trigger
	subsequent ddl diffs
 */
export const isSerialExpression = (expr: string, schema: string) => {
	const schemaPrefix = schema === 'public' ? '' : `${schema}.`;
	return expr.startsWith(`nextval('${schemaPrefix}`) && expr.endsWith(`_seq'::regclass)`);
};

export function stringFromDatabaseIdentityProperty(field: any): string | null {
	return typeof field === 'string'
		? (field as string)
		: typeof field === undefined || field === null
		? null
		: typeof field === 'bigint'
		? field.toString()
		: String(field);
}

export function buildArrayString(array: any[], sqlType: string): string {
	// we check if array consists only of empty arrays down to 5th dimension
	if (array.flat(5).length === 0) {
		return '{}';
	}

	const values = array
		.map((value) => {
			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			}

			if (typeof value === 'boolean') {
				return value ? 't' : 'f';
			}

			if (Array.isArray(value)) {
				return buildArrayString(value, sqlType);
			}

			if (sqlType.startsWith('numeric')) {
				return String(value);
			}

			if (value instanceof Date) {
				if (sqlType === 'date') {
					return `${value.toISOString().split('T')[0]}`;
				} else if (sqlType === 'timestamp') {
					return `"${value.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23)}"`;
				} else {
					return `"${value.toISOString().replace('T', ' ').replace('Z', '')}"`;
				}
			}

			if (typeof value === 'object') {
				return `"${JSON.stringify(value).replaceAll('"', '\\"')}"`;
			}

			if (typeof value === 'string') {
				if (/^[a-zA-Z0-9./_':-]+$/.test(value)) return value.replaceAll("'", "''");
				return `"${value.replaceAll("'", "''").replaceAll('"', '\\"')}"`;
			}

			return `"${value}"`;
		})
		.join(',');

	return `{${values}}`;
}

export type OnAction = PostgresEntities['fks']['onUpdate'];
export const parseOnType = (type: string): OnAction => {
	switch (type) {
		case 'a':
			return 'NO ACTION';
		case 'r':
			return 'RESTRICT';
		case 'n':
			return 'SET NULL';
		case 'c':
			return 'CASCADE';
		case 'd':
			return 'SET DEFAULT';
		default:
			throw new Error(`Unknown foreign key type: ${type}`);
	}
};

export const systemNamespaceNames = ['pg_toast', 'pg_catalog', 'information_schema'];
export const isSystemNamespace = (name: string) => {
	return name.startsWith('pg_toast') || name === 'pg_default' || name === 'pg_global' || name.startsWith('pg_temp_')
		|| systemNamespaceNames.indexOf(name) >= 0;
};

export const isSystemRole = (name: string) => {
	return name === 'postgres' || name.startsWith('pg_');
};

type DefaultMapper<IN> = (value: IN | IN[]) => Column['default'];

export const defaultForVector: DefaultMapper<[number, number, number]> = (value) => {
	const res = stringifyTuplesArray(value, 'sql', (x: number[], depth: number) => {
		const res = x.length > 0 ? `[${x[0]},${x[1]},${x[2]}]` : '{}';
		return depth === 0 ? res : `"${res}"`;
	});
	return { value: `'${res}'`, type: 'unknown' };
};

// TODO: check
// export const splitExpressions = (input: string | null): string[] => {
// 	if (!input) return [];

// 	const wrapped = input.startsWith('(') && input.endsWith(')');
// 	input = wrapped ? input.slice(1, input.length - 1) : input;

// 	// This regex uses three alternatives:
// 	// 1. Quoted strings that allow escaped quotes: '([^']*(?:''[^']*)*)'
// 	// 2. Parenthesized expressions that support one level of nesting:
// 	//      \((?:[^()]+|\([^()]*\))*\)
// 	// 3. Any character that is not a comma, quote, or parenthesis: [^,'()]
// 	//
// 	// It also trims optional whitespace before and after each token,
// 	// requiring that tokens are followed by a comma or the end of the string.
// 	// const regex = /\s*((?:'[^']*(?:''[^']*)*'|\((?:[^()]+|\([^()]*\))*\)|[^,'()])+)\s*(?:,|$)/g;
// 	const regex = /\s*((?:'(?:[^']|'')*'|\((?:[^()]+|\([^()]*\))*\)|[^,'()])+)\s*(?:,|$)/g;
// 	const result: string[] = [];
// 	let match: RegExpExecArray | null;

// 	while ((match = regex.exec(input)) !== null) {
// 		result.push(match[1].trim());
// 	}

// 	return result;
// };

export const wrapRecord = (it: Record<string, string>) => {
	return {
		bool: (key: string) => {
			if (key in it) {
				if (it[key] === 'true') {
					return true;
				}
				if (it[key] === 'false') {
					return false;
				}

				throw new Error(`Invalid options boolean value for ${key}: ${it[key]}`);
			}
			return null;
		},
		num: (key: string) => {
			if (key in it) {
				const value = Number(it[key]);
				if (isNaN(value)) {
					throw new Error(`Invalid options number value for ${key}: ${it[key]}`);
				}
				return value;
			}
			return null;
		},
		str: (key: string) => {
			if (key in it) {
				return it[key];
			}
			return null;
		},
		literal: <T extends string>(key: string, allowed: T[]): T | null => {
			if (!(key in it)) return null;
			const value = it[key];

			if (allowed.includes(value as T)) {
				return value as T;
			}
			throw new Error(`Invalid options literal value for ${key}: ${it[key]}`);
		},
	};
};

/*
	CHECK (((email)::text <> 'test@gmail.com'::text))
	Where (email) is column in table
*/
export const parseCheckDefinition = (value: string): string => {
	return value.replace(/^CHECK\s*\(\(/, '').replace(/\)\)\s*$/, '');
};

export const parseViewDefinition = (value: string | null | undefined): string | null => {
	if (!value) return null;
	return value.replace(/\s+/g, ' ').replace(';', '').trim();
};

export const defaultNameForIdentitySequence = (table: string, column: string) => {
	return `${table}_${column}_seq`;
};

export const defaultNameForPK = (table: string) => {
	return `${table}_pkey`;
};

export const defaultNameForFK = (table: string, columns: string[], tableTo: string, columnsTo: string[]) => {
	const desired = `${table}_${columns.join('_')}_${tableTo}_${columnsTo.join('_')}_fkey`;
	const res = desired.length > 63
		? table.length < 63 - 18 // _{hash(12)}_fkey
			? `${table}_${hash(desired)}_fkey`
			: `${hash(desired)}_fkey` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForUnique = (table: string, ...columns: string[]) => {
	return `${table}_${columns.join('_')}_key`;
};

export const defaultNameForIndex = (table: string, columns: string[]) => {
	return `${table}_${columns.join('_')}_idx`;
};

export const trimDefaultValueSuffix = (value: string) => {
	let res = value.endsWith('[]') ? value.slice(0, -2) : value;
	res = res.replace(/::["\w\s"]+(\([^\)]*\))?(["\w\s"]+)?(\[\])*$/g, '');
	return res;
};

export const defaultForColumn = (
	type: string,
	def: string | boolean | number | null | undefined,
	dimensions: number,
	isEnum: boolean,
): Column['default'] => {
	if (
		def === null
		|| def === undefined
		|| type === 'serial'
		|| type === 'smallserial'
		|| type === 'bigserial'
	) {
		return null;
	}

	if (typeof def === 'boolean') {
		return { type: 'boolean', value: String(def) };
	}

	if (typeof def === 'number') {
		return { type: 'number', value: String(def) };
	}

	let value = trimDefaultValueSuffix(def);
	const grammarType = typeFor(type, isEnum);
	if (dimensions > 0) return grammarType.defaultArrayFromIntrospect(value);
	return grammarType.defaultFromIntrospect(String(value));
};

export const defaultToSQL = (
	it: Pick<Column, 'default' | 'dimensions' | 'type' | 'typeSchema'>,
) => {
	if (!it.default) return '';

	const { type: columnType, dimensions, typeSchema } = it;
	const { value } = it.default;

	if (typeSchema) {
		const schemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
		return `${value}::${schemaPrefix}"${columnType.replaceAll('[]', '')}"${dimensions > 0 ? '[]' : ''}`;
	}

	const suffix = dimensions > 0 ? `::${columnType.replaceAll('[]', '')}[]` : '';

	const defaultValue = it.default.value ?? '';
	return `${defaultValue}${suffix}`;
};

export const isDefaultAction = (action: string) => {
	return action.toLowerCase() === 'no action';
};

export const isSerialType = (type: string) => {
	return /^(?:serial|bigserial|smallserial)$/i.test(type);
};

export const defaults = {
	/*
			By default, PostgreSQL uses the cluster’s default tablespace (which is named 'pg_default')

			This operation requires an exclusive lock on the materialized view (it rewrites the data file),
			and you must have CREATE privilege on the target tablespace.
			If you have indexes on the materialized view, note that moving the base table does not automatically move its indexes.
			Each index is a separate object and retains its original tablespace​.

			You should move indexes individually, for example:
			sql`ALTER INDEX my_matview_idx1 SET TABLESPACE pg_default`;
			sql`ALTER INDEX my_matview_idx2 SET TABLESPACE pg_default`;
		*/
	tablespace: 'pg_default',

	/*
		The table access method (the storage engine format) is chosen when the materialized view is created,
		 using the optional USING <method> clause.
		 If no method is specified, it uses the default access method (typically the regular heap storage)​

		sql`
			CREATE MATERIALIZED VIEW my_matview
			USING heap  -- storage access method; "heap" is the default
			AS SELECT ...;
		`

		Starting with PostgreSQL 15, you can alter a materialized view’s access method in-place.
		PostgreSQL 15 introduced support for ALTER MATERIALIZED VIEW ... SET ACCESS METHOD new_method
		*/
	accessMethod: 'heap',

	/*
		By default, NULL values are treated as distinct entries.
		Specifying NULLS NOT DISTINCT on unique indexes / constraints will cause NULL to be treated as not distinct,
		or in other words, equivalently.

		https://www.postgresql.org/about/featurematrix/detail/392/
	*/
	nullsNotDistinct: false,

	identity: {
		startWith: '1',
		increment: '1',
		min: '1',
		maxFor: (type: string) => {
			if (type === 'smallint') return '32767';
			if (type === 'integer') return '2147483647';
			if (type === 'bigint') return '9223372036854775807';
			throw new Error(`Unknow identity column type: ${type}`);
		},
		cache: 1,
		cycle: false,
	},

	index: {
		method: 'btree',
	},
} as const;
