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
