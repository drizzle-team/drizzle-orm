// Runtime-agnostic UTF-8 & base64 helpers for cache implementations.

interface NodeBufferLike {
	from(
		data: ArrayBufferLike,
		byteOffset?: number,
		length?: number,
	): Uint8Array & { toString(encoding: 'base64'): string };
	from(data: string, encoding: 'base64'): Uint8Array;
	isBuffer(value: unknown): boolean;
}

let buffer: NodeBufferLike | null | undefined;
export function getBuffer(): NodeBufferLike | null {
	if (buffer !== undefined) return buffer;

	const candidate = (globalThis as any).Buffer;
	return (buffer = typeof candidate?.from === 'function' && typeof candidate.isBuffer === 'function'
		? candidate
		: null);
}

const getGlobal = <T>(name: string): T | undefined => {
	const value = (globalThis as any)[name];
	return typeof value === 'function' ? value : undefined;
};

let textEncoder: TextEncoder | null | undefined;
let textDecoder: TextDecoder | null | undefined;

const getTextEncoder = (): TextEncoder | null => {
	if (textEncoder !== undefined) return textEncoder;
	const ctor = getGlobal<typeof TextEncoder>('TextEncoder');
	return (textEncoder = ctor ? new ctor() : null);
};

const getTextDecoder = (): TextDecoder | null => {
	if (textDecoder !== undefined) return textDecoder;
	const ctor = getGlobal<typeof TextDecoder>('TextDecoder');
	return (textDecoder = ctor ? new ctor() : null);
};

/**
 * Writes UTF-8 bytes of `value` into `dest` starting at `offset`, returns the number of written bytes.
 *
 * `dest` must have at least `value.length * 3` bytes of space after `offset`.
 *
 * Lone surrogates are written as U+FFFD, identical to `TextEncoder`.
 */
function encodeUtf8IntoJs(value: string, dest: Uint8Array, offset: number): number {
	let pos = offset;
	for (let i = 0; i < value.length; ++i) {
		let code = value.charCodeAt(i);

		if (code < 0x80) {
			dest[pos++] = code;
			continue;
		}

		if (code < 0x800) {
			dest[pos++] = 0xc0 | (code >> 6);
			dest[pos++] = 0x80 | (code & 0x3f);
			continue;
		}

		if (code >= 0xd800 && code <= 0xdfff) {
			const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
			if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
				code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
				++i;
				dest[pos++] = 0xf0 | (code >> 18);
				dest[pos++] = 0x80 | ((code >> 12) & 0x3f);
				dest[pos++] = 0x80 | ((code >> 6) & 0x3f);
				dest[pos++] = 0x80 | (code & 0x3f);
				continue;
			}
			code = 0xfffd;
		}

		dest[pos++] = 0xe0 | (code >> 12);
		dest[pos++] = 0x80 | ((code >> 6) & 0x3f);
		dest[pos++] = 0x80 | (code & 0x3f);
	}
	return pos - offset;
}

/**
 * Writes UTF-8 bytes of `value` into `dest` starting at `offset`, returns the number of written bytes.
 *
 * `dest` must have at least `value.length * 3` bytes of space after `offset`.
 *
 * Lone surrogates are written as U+FFFD, identical to `TextEncoder`.
 */
export function encodeUtf8Into(value: string, dest: Uint8Array, offset: number): number {
	const encoder = getTextEncoder();
	if (encoder && typeof encoder.encodeInto === 'function') {
		return encoder.encodeInto(value, dest.subarray(offset)).written;
	}
	return encodeUtf8IntoJs(value, dest, offset);
}

export function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
	const encoder = getTextEncoder();
	if (encoder) return encoder.encode(value);

	const dest = new Uint8Array(value.length * 3);
	return dest.subarray(0, encodeUtf8IntoJs(value, dest, 0));
}

/**
 * Decodes UTF-8, replacing malformed sequences with U+FFFD.
 *
 * Fallback follows the WHATWG UTF-8 decoder algorithm, so output is identical to `TextDecoder`'s
 */
export function decodeUtf8(bytes: Uint8Array): string {
	const decoder = getTextDecoder();
	if (decoder) return decoder.decode(bytes);

	let out = '';
	let units: number[] = [];
	const emit = (code: number) => {
		if (code > 0xffff) {
			code -= 0x10000;
			units.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
		} else units.push(code);

		if (units.length >= 8192) {
			out += String.fromCharCode.apply(null, units);
			units = [];
		}
	};

	let codePoint = 0;
	let needed = 0;
	let seen = 0;
	let lower = 0x80;
	let upper = 0xbf;

	for (let i = 0; i < bytes.length; ++i) {
		const byte = bytes[i]!;

		if (needed === 0) {
			if (byte <= 0x7f) emit(byte);
			else if (byte >= 0xc2 && byte <= 0xdf) {
				needed = 1;
				codePoint = byte & 0x1f;
			} else if (byte >= 0xe0 && byte <= 0xef) {
				if (byte === 0xe0) lower = 0xa0;
				if (byte === 0xed) upper = 0x9f;
				needed = 2;
				codePoint = byte & 0x0f;
			} else if (byte >= 0xf0 && byte <= 0xf4) {
				if (byte === 0xf0) lower = 0x90;
				if (byte === 0xf4) upper = 0x8f;
				needed = 3;
				codePoint = byte & 0x07;
			} else emit(0xfffd);
			continue;
		}

		if (byte < lower || byte > upper) {
			// Ill-formed sequence: replace what was consumed so far, then reprocess this byte
			codePoint = needed = seen = 0;
			lower = 0x80;
			upper = 0xbf;
			emit(0xfffd);
			--i;
			continue;
		}

		lower = 0x80;
		upper = 0xbf;
		codePoint = (codePoint << 6) | (byte & 0x3f);
		if (++seen === needed) {
			emit(codePoint);
			codePoint = needed = seen = 0;
		}
	}
	if (needed !== 0) emit(0xfffd);

	return out + String.fromCharCode.apply(null, units);
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let base64Lookup: Uint8Array | undefined;

// Chunked to stay below engine argument count limits of `apply`
const APPLY_CHUNK = 8192;

export function encodeBase64(bytes: Uint8Array): string {
	const Buffer = getBuffer();
	if (Buffer) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

	const btoa = getGlobal<(data: string) => string>('btoa');
	if (btoa) {
		let binary = '';
		for (let i = 0; i < bytes.length; i += APPLY_CHUNK) {
			binary += String.fromCharCode.apply(null, bytes.subarray(i, i + APPLY_CHUNK) as unknown as number[]);
		}
		return btoa(binary);
	}

	let out = '';
	let i = 0;
	for (; i + 2 < bytes.length; i += 3) {
		const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
		out += BASE64_ALPHABET[n >> 18]! + BASE64_ALPHABET[(n >> 12) & 63]! + BASE64_ALPHABET[(n >> 6) & 63]!
			+ BASE64_ALPHABET[n & 63]!;
	}
	const rest = bytes.length - i;
	if (rest === 1) {
		const n = bytes[i]! << 16;
		out += BASE64_ALPHABET[n >> 18]! + BASE64_ALPHABET[(n >> 12) & 63]! + '==';
	} else if (rest === 2) {
		const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
		out += BASE64_ALPHABET[n >> 18]! + BASE64_ALPHABET[(n >> 12) & 63]! + BASE64_ALPHABET[(n >> 6) & 63]! + '=';
	}
	return out;
}

export function decodeBase64(value: string): Uint8Array {
	const Buffer = getBuffer();
	if (Buffer) {
		const buf = Buffer.from(value, 'base64');
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	const atob = getGlobal<(data: string) => string>('atob');
	if (atob) {
		let binary: string | undefined;
		try {
			binary = atob(value);
		} catch {}
		if (binary !== undefined) {
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; ++i) bytes[i] = binary.charCodeAt(i);
			return bytes;
		}
	}

	if (!base64Lookup) {
		base64Lookup = new Uint8Array(128).fill(255);
		for (let i = 0; i < BASE64_ALPHABET.length; ++i) base64Lookup[BASE64_ALPHABET.charCodeAt(i)] = i;
	}

	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 61 /* = */) --end;

	const bytes = new Uint8Array(Math.floor((end * 3) / 4));
	let acc = 0;
	let bits = 0;
	let pos = 0;
	for (let i = 0; i < end; ++i) {
		const code = value.charCodeAt(i);
		const digit = code < 128 ? base64Lookup[code]! : 255;
		if (digit === 255) throw new Error('Invalid base64 character');
		acc = ((acc << 6) | digit) & 0xffffff;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			bytes[pos++] = (acc >> bits) & 0xff;
		}
	}
	return bytes.subarray(0, pos);
}
