// A shape declares each column's type; the server's RowDescription says what the column really is. When the two
// differ, the declared decoder would read bytes of another type and return a value the database never held. This
// module replaces the plan of such a column with one that reads the real type and gives the JS value the shape
// asked for, or throws when it can't.
//
// The rule follows the JS value the shape promises, not the declared Postgres type:
//   number   any integer, float or numeric column, loss accepted; an int8 beyond 2^53 throws
//   bigint   any integer column; a float or numeric column when the value is whole
//   string   the database's own text of the value
//   boolean  a numeric column as Boolean(number) does it; text t / f / true / false
//   Date     date, timestamp and timestamptz columns read as each other
// A text column is parsed strictly as the declared type. Everything else throws, naming the column and both types.
//
// The wire format of a column was chosen from the shape before the server answered (Bind goes out with Parse), so
// a column arrives in the format the declared type asked for: the real type's binary bytes, or its text.
import { addBrand } from './brand.ts';
import type { CodegenCol } from './decode.ts';
import { instantFromString } from './temporal.ts';
import type { Field } from './types.ts';

const INT2 = 21, INT4 = 23, OID = 26, INT8 = 20, FLOAT4 = 700, FLOAT8 = 701, NUMERIC = 1700, MONEY = 790, BOOL = 16;
const TEXT = 25, VARCHAR = 1043, BPCHAR = 1042, CHAR = 18, NAME = 19, JSON_OID = 114, JSONB = 3802, BYTEA = 17;
const UUID = 2950, DATE = 1082, TIME = 1083, TIMESTAMP = 1114, TIMESTAMPTZ = 1184, INTERVAL = 1186;

const INTS = new Set([INT2, INT4, OID, INT8]);
const FLOATS = new Set([FLOAT4, FLOAT8]);
const TEXTS = new Set([TEXT, VARCHAR, BPCHAR, CHAR, NAME]);
const INSTANTS = new Set([DATE, TIMESTAMP, TIMESTAMPTZ]);
const JSONS = new Set([JSON_OID, JSONB]);

const TYPE_NAME: Record<number, string> = {
	[INT2]: 'int2',
	[INT4]: 'int4',
	[OID]: 'oid',
	[INT8]: 'int8',
	[FLOAT4]: 'float4',
	[FLOAT8]: 'float8',
	[NUMERIC]: 'numeric',
	[MONEY]: 'money',
	[BOOL]: 'bool',
	[TEXT]: 'text',
	[VARCHAR]: 'varchar',
	[BPCHAR]: 'bpchar',
	[CHAR]: 'char',
	[NAME]: 'name',
	[JSON_OID]: 'json',
	[JSONB]: 'jsonb',
	[BYTEA]: 'bytea',
	[UUID]: 'uuid',
	[DATE]: 'date',
	[TIME]: 'time',
	[TIMESTAMP]: 'timestamp',
	[TIMESTAMPTZ]: 'timestamptz',
	[INTERVAL]: 'interval',
};
const typeName = (oid: number) => TYPE_NAME[oid] ?? `type with OID ${oid}`;

/** What the driver throws for a column whose real type can't give the value its shape declares. */
export class ShapeMismatchError extends Error {
	constructor(column: string, declared: string, real: number, why: string) {
		super(
			`@drizzle/postgres: column "${column}" is declared ${declared} in the shape, but the database returned ${
				typeName(real)
			}: ${why}`,
		);
		this.name = 'ShapeMismatchError';
	}
}
addBrand(ShapeMismatchError, 'ShapeMismatchError');

type Convert = (v: unknown) => unknown;
/** How to read a mismatched column: decode it as `read`, then `convert` the value. */
interface Reading {
	read: Pick<CodegenCol, 'oid' | 'js' | 'format'>;
	convert: Convert;
}

const NUMBER_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const INTEGER_TEXT = /^[+-]?\d+$/;
const WHOLE_TEXT = /^([+-]?\d+)(?:\.0*)?$/;
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Postgres's binary numeric: int16 ndigits, weight, sign, dscale, then base-10000 digits. Returns its text. */
export function numericFromBinary(b: Uint8Array): string {
	const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
	const ndigits = view.getInt16(0);
	const weight = view.getInt16(2);
	const sign = view.getUint16(4);
	const dscale = view.getInt16(6);
	if (sign === 0xc000) return 'NaN';
	if (sign === 0xd000) return 'Infinity';
	if (sign === 0xf000) return '-Infinity';
	// digit group i stands for 10000^(weight - i); groups outside the stored ones are zero
	const group = (i: number) => (i >= 0 && i < ndigits ? view.getInt16(8 + i * 2) : 0);
	let int = weight < 0 ? '0' : String(group(0));
	for (let i = 1; i <= weight; i++) int += String(group(i)).padStart(4, '0');
	let frac = '';
	for (let i = weight + 1; frac.length < dscale; i++) frac += String(group(i)).padStart(4, '0');
	return (sign === 0x4000 ? '-' : '') + int + (dscale > 0 ? '.' + frac.slice(0, dscale) : '');
}

/** The reading of column `c`, declared with OID `c.oid`, whose real type is `real`. Throws when the two can never
 *  agree; the returned convert throws when one value can't be represented. Null passes through. */
function reading(c: CodegenCol, real: number): Reading | undefined {
	const declared = c.oid;
	const label = typeName(declared) + (c.js ? `:${c.js}` : '');
	const fail = (why: string) => new ShapeMismatchError(c.name, label, real, why);
	const never = (why: string): never => {
		throw fail(why);
	};
	const binary = c.format === 'binary';
	const nullable = (convert: (v: any) => unknown): Convert => (v) => (v === null || v === undefined ? v : convert(v));

	// How the real value is read from the wire, in the format the declared type asked for
	const asText: Reading['read'] = { oid: TEXT, js: 'string' };
	const source = (): {
		read: Reading['read'];
		kind: 'int' | 'float' | 'numeric' | 'text' | 'bool' | 'instant' | 'other';
	} => {
		if (TEXTS.has(real)) return { read: asText, kind: 'text' }; // text is the same bytes in both formats
		const kind = INTS.has(real)
			? 'int'
			: FLOATS.has(real)
			? 'float'
			: real === NUMERIC
			? 'numeric'
			: real === BOOL
			? 'bool'
			: INSTANTS.has(real)
			? 'instant'
			: 'other';
		if (!binary) return { read: asText, kind };
		if (kind === 'numeric') return { read: { oid: BYTEA, format: 'binary' }, kind }; // raw bytes, decoded below
		if (kind === 'instant') return { read: { oid: real, format: 'binary', js: 'ms' }, kind };
		if (kind === 'other') return never("its binary form can't be read as the declared type");
		return { read: { oid: real, format: 'binary' }, kind };
	};

	// The real value as a number, a bigint, or its exact text, whichever the wire gave
	const toNumber = (kind: string) =>
		nullable((v: number | bigint | string | Uint8Array) => {
			if (typeof v === 'number') return v;
			if (typeof v === 'bigint') {
				if (v > MAX_SAFE || v < -MAX_SAFE) throw fail(`${v} is beyond what a JS number holds exactly`);
				return Number(v);
			}
			const text = typeof v === 'string' ? v : numericFromBinary(v);
			if (kind === 'text' && !NUMBER_TEXT.test(text) && text !== 'NaN' && !/^-?Infinity$/.test(text)) {
				throw fail(`${JSON.stringify(text)} is not a number`);
			}
			if (real === INT8 && text.length > 15) {
				const big = BigInt(text);
				if (big > MAX_SAFE || big < -MAX_SAFE) throw fail(`${text} is beyond what a JS number holds exactly`);
			}
			return Number(text);
		});
	const toBigInt = (kind: string) =>
		nullable((v: number | bigint | string | Uint8Array) => {
			if (typeof v === 'bigint') return v;
			if (typeof v === 'number') {
				if (!Number.isInteger(v)) throw fail(`${v} is not a whole number`);
				return BigInt(v);
			}
			const text = typeof v === 'string' ? v : numericFromBinary(v);
			if (kind === 'text') {
				if (!INTEGER_TEXT.test(text)) throw fail(`${JSON.stringify(text)} is not an integer`);
				return BigInt(text);
			}
			const whole = WHOLE_TEXT.exec(text);
			if (whole) return BigInt(whole[1]!);
			const n = Number(text); // a float's text may be in exponent form
			if (!Number.isInteger(n)) throw fail(`${text} is not a whole number`);
			return BigInt(n);
		});
	const toExactText = (kind: string) =>
		nullable((v: number | bigint | string | Uint8Array) => {
			const text = v instanceof Uint8Array ? numericFromBinary(v) : String(v);
			if (kind === 'text' && !NUMBER_TEXT.test(text) && text !== 'NaN' && !/^-?Infinity$/.test(text)) {
				throw fail(`${JSON.stringify(text)} is not a number`);
			}
			return text;
		});
	const numericSource = () => {
		const s = source();
		if (s.kind !== 'int' && s.kind !== 'float' && s.kind !== 'numeric' && s.kind !== 'text') {
			return never('it is not a numeric type');
		}
		return s;
	};

	// Declared text family: every type's text is a faithful value, read as UTF-8 as a text column already is.
	if (TEXTS.has(declared)) {
		if (real === BYTEA) return never('bytes have no text value; read the column as bytea');
		return undefined; // the declared decoder reads the database's text as it is
	}
	if (JSONS.has(declared) || c.json) {
		if (JSONS.has(real) || TEXTS.has(real)) return undefined; // JSON text either way; invalid JSON throws in the decoder
		return never('it is not JSON');
	}
	if (c.array) {
		// An array arrives as its text literal. Text elements are a faithful value of any element type, which is how
		// arrays of types the driver doesn't know (cidr[], timetz[]) are read on purpose, as text[].
		if (TEXTS.has(c.array.elem) && !c.array.custom) return undefined;
		return never('an array must be declared with its own element type, or as text[]');
	}
	if (c.custom) return never('a custom type must match exactly');

	switch (declared) {
		case INT2:
		case INT4:
		case OID:
		case FLOAT4:
		case FLOAT8: {
			const s = numericSource();
			return { read: s.read, convert: c.js === 'string' ? toExactText(s.kind) : toNumber(s.kind) };
		}
		case INT8: {
			const s = numericSource();
			return {
				read: s.read,
				convert: c.js === 'number' ? toNumber(s.kind) : c.js === 'string' ? toExactText(s.kind) : toBigInt(s.kind),
			};
		}
		case NUMERIC: {
			const s = numericSource();
			return {
				read: s.read,
				convert: c.js === 'number' ? toNumber(s.kind) : c.js === 'bigint' ? toBigInt(s.kind) : toExactText(s.kind),
			};
		}
		case BOOL: {
			const s = source();
			if (s.kind === 'int' || s.kind === 'float' || s.kind === 'numeric') {
				// as Boolean(number): 0, -0 and NaN are false, every other number is true
				return {
					read: s.read,
					convert: nullable((v: number | bigint | string | Uint8Array) =>
						Boolean(Number(v instanceof Uint8Array ? numericFromBinary(v) : v))
					),
				};
			}
			if (s.kind === 'text') {
				return {
					read: s.read,
					convert: nullable((v: string) => {
						if (v === 't' || v === 'true') return true;
						if (v === 'f' || v === 'false') return false;
						throw fail(`${JSON.stringify(v)} is not t, f, true or false`);
					}),
				};
			}
			return never('it is not a boolean, a number or text');
		}
		case UUID: {
			if (!TEXTS.has(real)) return never('it is not a uuid or text');
			return {
				read: asText,
				convert: nullable((v: string) => {
					if (!UUID_TEXT.test(v)) throw fail(`${JSON.stringify(v)} is not a uuid`);
					return v;
				}),
			};
		}
		case DATE:
		case TIMESTAMP:
		case TIMESTAMPTZ: {
			const s = source();
			if (s.kind !== 'instant' && s.kind !== 'text') return never('it is not a date, a timestamp or text');
			const fromText = (v: string): number => {
				const ms = instantFromString(v);
				if (ms === undefined) throw fail(`${JSON.stringify(v)} is not a date or timestamp`);
				return ms;
			};
			if (c.js === 'string') { // text format: the database's own text
				return { read: asText, convert: nullable((v: string) => (s.kind === 'text' ? (fromText(v), v) : v)) };
			}
			const ms = (v: number | string): number => (typeof v === 'number' ? v : fromText(v));
			return { read: s.read, convert: nullable((v: number | string) => (c.js === 'ms' ? ms(v) : new Date(ms(v)))) };
		}
		case TIME:
		case INTERVAL:
		case MONEY: {
			if (!TEXTS.has(real)) return never(`it is not ${typeName(declared)} or text`);
			return undefined; // text of the same form, read as it is
		}
		case BYTEA:
			return never('it is not bytea');
		default:
			return never("the two types can't be read as each other");
	}
}

let reconciledId = -1;

/** The plan of a shape for the columns the server really returns: `cols` with the real OID filled in for 'unknown'
 *  columns, and every column whose declared type differs replaced by one that reads the real type. Returns `cols`
 *  itself when nothing differs. Throws a ShapeMismatchError when a column can never give its declared value. */
export function reconcileCols(cols: CodegenCol[], fields: readonly Field[]): CodegenCol[] {
	let out: CodegenCol[] | undefined;
	for (let i = 0; i < cols.length; i++) {
		const c = cols[i]!;
		const real = fields[i]?.dataTypeOid;
		if (real === undefined || real === c.oid) continue;
		let next: CodegenCol;
		if (c.oid === 0) next = { ...c, oid: real }; // 'unknown' or an extension type: the real OID is the answer
		else {
			const r = reading(c, real);
			if (r === undefined) continue;
			const { xform } = c;
			const { convert } = r;
			next = {
				...c,
				oid: r.read.oid,
				js: r.read.js,
				format: r.read.format,
				xform: xform ? (v) => xform(convert(v)) : convert,
				xformId: reconciledId--,
			};
		}
		(out ??= cols.slice())[i] = next;
	}
	return out ?? cols;
}
