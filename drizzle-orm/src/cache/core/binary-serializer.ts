import { entityKind, is } from '~/entity.ts';
import { decodeUtf8, encodeUtf8, encodeUtf8Into } from '~/utils.ts';
import { decodeBase64, encodeBase64, getBuffer } from './encoding.ts';

export const PAYLOAD_PREFIX = 'dzb1:';

const enum Tag {
	Undefined = 0,
	Null = 1,
	True = 2,
	False = 3,
	Int32 = 4,
	Float64 = 5,
	BigIntPos = 6,
	BigIntNeg = 7,
	String = 8,
	Date = 9,
	Array = 10,
	Object = 11,
	Uint8Array = 12,
	Buffer = 13,
	ArrayBuffer = 14,
	TypedArray = 15,
	DataView = 16,
	Map = 17,
	Set = 18,
	RegExp = 19,
}

const typedArrayNames: readonly string[] = [
	'Int8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
	'Float16Array',
] as const;

interface TypedArrayCtor {
	new(buffer: ArrayBuffer, byteOffset: number, length: number): ArrayBufferView;
	readonly BYTES_PER_ELEMENT: number;
}

let typedArrayCtors: (TypedArrayCtor | undefined)[] | undefined;

// Get constructors from `globalThis` to avoid crashing on engines without ones
const getTypedArrayCtors = () =>
	typedArrayCtors ??= typedArrayNames.map((name) => {
		const ctor = (globalThis as any)[name];
		return typeof ctor === 'function' ? ctor : undefined;
	});

// Create on first use to avoid crashes on engines without `BigInt` support if not used
let bigints: { zero: bigint; n32: bigint; u32Mask: bigint } | undefined;
const getBigInts = () => bigints ??= { zero: BigInt(0), n32: BigInt(32), u32Mask: BigInt(0xffffffff) };

class Writer {
	static readonly [entityKind]: string = 'UpstashBinaryWriter';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	private buf = new Uint8Array(1024);
	private view = new DataView(this.buf.buffer);
	private pos = 0;
	private keys = new Map<string, number>();

	private ensure(size: number) {
		const required = this.pos + size;
		if (required <= this.buf.length) return;

		let length = this.buf.length * 2;
		while (length < required) length *= 2;
		const next = new Uint8Array(length);
		next.set(this.buf.subarray(0, this.pos));
		this.buf = next;
		this.view = new DataView(next.buffer);
	}

	u8(value: number) {
		this.ensure(1);
		this.buf[this.pos++] = value;
	}

	/** Unsigned LEB128, safe for any non-negative safe integer */
	varint(value: number) {
		this.ensure(8);
		while (value >= 0x80) {
			this.buf[this.pos++] = (value % 0x80) | 0x80;
			value = Math.floor(value / 0x80);
		}
		this.buf[this.pos++] = value;
	}

	i32(value: number) {
		this.ensure(4);
		this.view.setInt32(this.pos, value, true);
		this.pos += 4;
	}

	u32(value: number) {
		this.ensure(4);
		this.view.setUint32(this.pos, value, true);
		this.pos += 4;
	}

	f64(value: number) {
		this.ensure(8);
		this.view.setFloat64(this.pos, value, true);
		this.pos += 8;
	}

	bytes(value: Uint8Array) {
		this.varint(value.length);
		this.ensure(value.length);
		this.buf.set(value, this.pos);
		this.pos += value.length;
	}

	string(value: string) {
		// UTF-8 takes at most 3 bytes per UTF-16 code unit
		const maxLength = value.length * 3;
		if (maxLength >= 0x80) {
			this.bytes(encodeUtf8(value));
			return;
		}

		// Short string: encoded length is guaranteed to fit into a single-byte varint, encode in place
		this.ensure(maxLength + 1);
		const lengthPos = this.pos++;
		const written = encodeUtf8Into(value, this.buf, this.pos);
		this.buf[lengthPos] = written;
		this.pos += written;
	}

	/** Object keys are interned: rows tend to repeat the same keys */
	key(value: string) {
		const index = this.keys.get(value);
		if (index !== undefined) {
			this.varint(index + 1);
			return;
		}

		this.keys.set(value, this.keys.size);
		this.varint(0);
		this.string(value);
	}

	finish(): Uint8Array {
		return this.buf.subarray(0, this.pos);
	}
}

class Reader {
	static readonly [entityKind]: string = 'UpstashBinaryReader';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	private view: DataView;
	private pos = 0;
	private keys: string[] = [];

	constructor(private buf: Uint8Array) {
		this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	u8(): number {
		if (this.pos >= this.buf.length) throw new Error('Unexpected end of cache payload');
		return this.buf[this.pos++]!;
	}

	varint(): number {
		let result = 0;
		let multiplier = 1;
		let byte: number;
		do {
			byte = this.u8();
			result += (byte & 0x7f) * multiplier;
			multiplier *= 0x80;
		} while (byte & 0x80);
		return result;
	}

	i32(): number {
		const value = this.view.getInt32(this.pos, true);
		this.pos += 4;
		return value;
	}

	u32(): number {
		const value = this.view.getUint32(this.pos, true);
		this.pos += 4;
		return value;
	}

	f64(): number {
		const value = this.view.getFloat64(this.pos, true);
		this.pos += 8;
		return value;
	}

	/** Returns a copy, so the result owns an exactly-sized, zero-offset buffer */
	bytes(): Uint8Array {
		const length = this.varint();
		const end = this.pos + length;
		if (end > this.buf.length) throw new Error('Unexpected end of cache payload');
		const value = this.buf.slice(this.pos, end);
		this.pos = end;
		return value;
	}

	string(): string {
		const length = this.varint();
		const end = this.pos + length;
		if (end > this.buf.length) throw new Error('Unexpected end of cache payload');
		const value = decodeUtf8(this.buf.subarray(this.pos, end));
		this.pos = end;
		return value;
	}

	key(): string {
		const ref = this.varint();
		if (ref !== 0) {
			const key = this.keys[ref - 1];
			if (key === undefined) throw new Error('Invalid key reference in cache payload');
			return key;
		}

		const key = this.string();
		this.keys.push(key);
		return key;
	}

	get done(): boolean {
		return this.pos === this.buf.length;
	}
}

function writeBigInt(w: Writer, value: bigint) {
	const { zero, n32, u32Mask } = getBigInts();
	const negative = value < zero;
	let magnitude = negative ? -value : value;
	const chunks: number[] = [];
	while (magnitude > zero) {
		chunks.push(Number(magnitude & u32Mask));
		magnitude >>= n32;
	}

	w.u8(negative ? Tag.BigIntNeg : Tag.BigIntPos);
	w.varint(chunks.length);
	for (const chunk of chunks) w.u32(chunk);
}

function readBigInt(r: Reader, negative: boolean): bigint {
	const length = r.varint();
	const chunks: number[] = new Array(length);
	for (let i = 0; i < length; ++i) chunks[i] = r.u32();

	const { zero, n32 } = getBigInts();
	let value = zero;
	for (let i = length - 1; i >= 0; --i) {
		value = (value << n32) | BigInt(chunks[i]!);
	}

	return negative ? -value : value;
}

function writeValue(w: Writer, value: unknown, seen: Set<object>): void {
	switch (typeof value) {
		case 'undefined':
		case 'function':
		case 'symbol': {
			w.u8(Tag.Undefined);
			return;
		}
		case 'boolean': {
			w.u8(value ? Tag.True : Tag.False);
			return;
		}
		case 'number': {
			if ((value | 0) === value && !Object.is(value, -0)) {
				w.u8(Tag.Int32);
				w.i32(value);
			} else {
				w.u8(Tag.Float64);
				w.f64(value);
			}
			return;
		}
		case 'bigint': {
			writeBigInt(w, value);
			return;
		}
		case 'string': {
			w.u8(Tag.String);
			w.string(value);
			return;
		}
	}

	if (value === null) {
		w.u8(Tag.Null);
		return;
	}

	const obj = value as object;

	if (obj instanceof Date) {
		w.u8(Tag.Date);
		w.f64(obj.getTime());
		return;
	}

	if (ArrayBuffer.isView(obj)) {
		const bytes = new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength);

		if (obj instanceof DataView) {
			w.u8(Tag.DataView);
			w.bytes(bytes);
			return;
		}

		if (obj instanceof Uint8Array) {
			w.u8(getBuffer()?.isBuffer(obj) ? Tag.Buffer : Tag.Uint8Array);
			w.bytes(bytes);
			return;
		}

		const ctorIndex = getTypedArrayCtors().findIndex((ctor) => ctor !== undefined && obj instanceof ctor);
		if (ctorIndex !== -1) {
			w.u8(Tag.TypedArray);
			w.key(typedArrayNames[ctorIndex]!);
			w.bytes(bytes);
			return;
		}

		// Unknown view type - store as plain bytes
		w.u8(Tag.Uint8Array);
		w.bytes(bytes);
		return;
	}

	if (obj instanceof ArrayBuffer) {
		w.u8(Tag.ArrayBuffer);
		w.bytes(new Uint8Array(obj));
		return;
	}

	if (obj instanceof RegExp) {
		w.u8(Tag.RegExp);
		w.string(obj.source);
		w.string(obj.flags);
		return;
	}

	if (seen.has(obj)) throw new TypeError('Unable to serialize circular structure into cache');
	seen.add(obj);

	if (Array.isArray(obj)) {
		w.u8(Tag.Array);
		w.varint(obj.length);
		for (let i = 0; i < obj.length; ++i) writeValue(w, obj[i], seen);
	} else if (obj instanceof Map) {
		w.u8(Tag.Map);
		w.varint(obj.size);
		for (const [k, v] of obj) {
			writeValue(w, k, seen);
			writeValue(w, v, seen);
		}
	} else if (obj instanceof Set) {
		w.u8(Tag.Set);
		w.varint(obj.size);
		for (const v of obj) writeValue(w, v, seen);
	} else {
		const keys = Object.keys(obj);
		w.u8(Tag.Object);
		w.varint(keys.length);
		for (const key of keys) {
			w.key(key);
			writeValue(w, (obj as Record<string, unknown>)[key], seen);
		}
	}

	seen.delete(obj);
}

function readValue(r: Reader): unknown {
	const tag = r.u8() as Tag;

	switch (tag) {
		case Tag.Undefined:
			return undefined;
		case Tag.Null:
			return null;
		case Tag.True:
			return true;
		case Tag.False:
			return false;
		case Tag.Int32:
			return r.i32();
		case Tag.Float64:
			return r.f64();
		case Tag.BigIntPos:
			return readBigInt(r, false);
		case Tag.BigIntNeg:
			return readBigInt(r, true);
		case Tag.String:
			return r.string();
		case Tag.Date:
			return new Date(r.f64());
		case Tag.Uint8Array:
			return r.bytes();
		case Tag.Buffer: {
			const bytes = r.bytes();
			return getBuffer()?.from(bytes.buffer, 0, bytes.byteLength) ?? bytes;
		}
		case Tag.ArrayBuffer:
			return r.bytes().buffer;
		case Tag.DataView:
			return new DataView(r.bytes().buffer);
		case Tag.TypedArray: {
			const name = r.key();
			const index = typedArrayNames.indexOf(name);
			const ctor = index === -1 ? undefined : getTypedArrayCtors()[index];
			// Unknown type or not supported by the runtime - payload can't be restored, treated as a cache miss
			if (!ctor) {
				throw new Error(
					index === -1
						? `Unsupported typed array type in cache payload: unknown type ${name}`
						: `Unsupported typed array type in cache payload: ${name} is not available in this runtime`,
				);
			}
			const bytes = r.bytes();
			return new ctor(bytes.buffer as ArrayBuffer, 0, bytes.byteLength / ctor.BYTES_PER_ELEMENT);
		}
		case Tag.RegExp: {
			const source = r.string();
			return new RegExp(source, r.string());
		}
		case Tag.Array: {
			const length = r.varint();
			const result: unknown[] = new Array(length);
			for (let i = 0; i < length; ++i) result[i] = readValue(r);
			return result;
		}
		case Tag.Map: {
			const size = r.varint();
			const result = new Map<unknown, unknown>();
			for (let i = 0; i < size; ++i) {
				const key = readValue(r);
				result.set(key, readValue(r));
			}
			return result;
		}
		case Tag.Set: {
			const size = r.varint();
			const result = new Set<unknown>();
			for (let i = 0; i < size; ++i) result.add(readValue(r));
			return result;
		}
		case Tag.Object: {
			const size = r.varint();
			const result: Record<string, unknown> = {};
			for (let i = 0; i < size; ++i) {
				const key = r.key();
				const value = readValue(r);
				// `__proto__` as an own data property, not a prototype assignment
				if (key === '__proto__') {
					Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
				} else result[key] = value;
			}
			return result;
		}
		default:
			throw new Error(`Unknown value tag in cache payload: ${tag}`);
	}
}

export function serializeBinary(value: unknown): Uint8Array {
	const writer = new Writer();
	writeValue(writer, value, new Set());
	return writer.finish();
}

export function deserializeBinary(bytes: Uint8Array): unknown {
	const reader = new Reader(bytes);
	const value = readValue(reader);
	if (!reader.done) throw new Error('Trailing data in cache payload');
	return value;
}

/** Serializes a value into a prefixed base64 string, safe to store in caches that only hold text or JSON */
export function serialize(value: unknown): string {
	return PAYLOAD_PREFIX + encodeBase64(serializeBinary(value));
}

/**
 * Restores a value produced by {@link serialize}.
 *
 * Returns `undefined` for anything that isn't a payload of this format (e.g. entries written by older versions,
 * which were stored as plain JSON) - those are treated as cache misses
 */
export function deserialize(value: unknown): unknown {
	if (typeof value !== 'string' || !value.startsWith(PAYLOAD_PREFIX)) return undefined;

	try {
		return deserializeBinary(decodeBase64(value.slice(PAYLOAD_PREFIX.length)));
	} catch {
		return undefined;
	}
}

export interface CacheSerializer<TRaw = unknown, TEncoded = unknown> {
	/** Converts a query response into a value stored in the cache */
	serialize(value: TRaw): TEncoded;
	/**
	 * Restores a query response from a value stored in the cache.
	 *
	 * Return `undefined` to treat the entry as a cache miss
	 */
	deserialize(value: TEncoded): TRaw | undefined;
}

/**
 * Serializer into drizzle's binary format, encoded as prefixed base64 text: preserves values JSON can't represent
 * (`bigint`, `Date`, `Buffer` and typed arrays, `Map`, `Set`, `undefined`, ...)
 */
export const binarySerializer: CacheSerializer<unknown, string> = {
	serialize,
	deserialize,
};
