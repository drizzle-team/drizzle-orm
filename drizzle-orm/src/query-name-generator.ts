import { is } from './entity.ts';
import { Placeholder } from './sql/sql.ts';

function isBinary(value: unknown): boolean {
	if (
		typeof Buffer !== 'undefined'
		&& typeof Buffer.isBuffer === 'function'
		&& Buffer.isBuffer(value)
	) return true;
	// oxlint-disable-next-line drizzle-internal/no-instanceof
	if (value instanceof ArrayBuffer) return true;
	if (ArrayBuffer.isView(value)) return true;
	return false;
}

function arrayTypeId(arr: readonly unknown[]) {
	if (!arr.length) return 'array<void>';
	let elementId: string | undefined;
	for (let i = 0; i < arr.length; i++) {
		const id = jsTypeId(arr[i]);

		if (!elementId) {
			elementId = id;
			continue;
		}

		if (elementId !== id) {
			elementId = `${elementId},${id}`;
			continue;
		}

		elementId = id;
	}
	return `array<${elementId}>`;
}

// replacement for type OID
function jsTypeId(value: unknown): string {
	if (value === null) return 'null';
	if (is(value, Placeholder)) return 'placeholder';
	// oxlint-disable-next-line drizzle-internal/no-instanceof
	if (value instanceof Date) return 'date';
	if (Array.isArray(value)) return arrayTypeId(value);
	if (isBinary(value)) return 'binary';
	return typeof value;
}

function hash(str: string, seed = 5381): number {
	let h = seed;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) + h) ^ str.charCodeAt(i);
	}
	return h >>> 0;
}

const safeChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
function stringify(hash: number, length: number, startWithLetter = false): string {
	let result = '';
	let h = hash;

	if (startWithLetter) {
		result += safeChars[h % 52];
		h = h >>> 6;
		--length;
	}

	while (result.length < length) {
		result += safeChars[h % safeChars.length];
		h = h >>> 6;
		if (h === 0) break;
	}

	return result;
}

export function preparedStatementName(
	sql: string,
	params: readonly unknown[] = [],
): string {
	let hash1 = hash(sql);
	let hash2 = hash(sql, 5381 ^ 0xdeadbeef);

	const paramIds = params.map(jsTypeId).join(',');
	for (let ti = 0; ti < paramIds.length; ti++) {
		hash1 = ((hash1 << 5) + hash1) ^ paramIds.charCodeAt(ti);
		hash2 = ((hash2 << 5) + hash2) ^ paramIds.charCodeAt(ti);
	}

	const part1 = stringify(hash1, 31, true);
	const part2 = stringify(hash2, 32);

	// Max out allowed name length to prevent collisions
	return part1 + part2;
}
