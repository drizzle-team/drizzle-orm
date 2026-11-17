import { describe, test } from 'vitest';
import { hashQuery, serializeParam } from '~/cache/core/cache.ts';

const query = 'select ?';

describe.concurrent('hashQuery collisions', () => {
	test('null, undefined', async ({ expect }) => {
		expect(await hashQuery(query, [null])).not.toBe(await hashQuery(query, [undefined]));
		expect(await hashQuery(query, [])).not.toBe(await hashQuery(query, undefined));
	});

	test('bigint, number, string mimic', async ({ expect }) => {
		expect(await hashQuery(query, [5n])).not.toBe(await hashQuery(query, ['5n']));
		expect(await hashQuery(query, [5n])).not.toBe(await hashQuery(query, ['5']));
		expect(await hashQuery(query, [5n])).not.toBe(await hashQuery(query, [5]));
	});

	test('large bigint', async ({ expect }) => {
		const max = 2n ** 53n;
		expect(await hashQuery(query, [max])).not.toBe(await hashQuery(query, [max + 1n]));
		expect(await hashQuery(query, [-max])).not.toBe(await hashQuery(query, [-max - 1n]));

		const u64 = 18446744073709551615n;
		expect(serializeParam(u64)).toBe('b18446744073709551615');
		expect(serializeParam({ nested: [u64 - 1n] })).toBe('o{"nested":a[b18446744073709551614]}');
		expect(await hashQuery(query, [u64])).not.toBe(await hashQuery(query, [u64 - 1n]));
	});

	test('null, NaN', async ({ expect }) => {
		expect(await hashQuery(query, [NaN])).not.toBe(await hashQuery(query, [null]));
	});

	test('Infinity | -Infinity', async ({ expect }) => {
		expect(await hashQuery(query, [Infinity])).not.toBe(await hashQuery(query, [-Infinity]));
	});

	test('string gets escaped', async ({ expect }) => {
		expect(await hashQuery(query, ['a', 'b'])).not.toBe(await hashQuery(query, ['a","b']));
		expect(await hashQuery(query, ['u'])).not.toBe(await hashQuery(query, [undefined]));
		expect(await hashQuery(query, [true])).not.toBe(await hashQuery(query, ['true']));
	});

	test('dates, bytes and json objects', async ({ expect }) => {
		const date = new Date('2026-09-15T00:00:00.000Z');
		expect(await hashQuery(query, [date])).not.toBe(await hashQuery(query, [date.toISOString()]));
		expect(await hashQuery(query, [date])).toBe(await hashQuery(query, [new Date(date)]));

		expect(await hashQuery(query, [new Uint8Array([1, 2])])).not.toBe(await hashQuery(query, [[1, 2]]));

		expect(await hashQuery(query, [{ a: null }])).not.toBe(await hashQuery(query, [{ a: undefined }]));
		expect(await hashQuery(query, [{ a: 1 }])).toBe(await hashQuery(query, [{ a: 1 }]));
	});

	test('byte views', ({ expect }) => {
		expect(serializeParam(new Uint8Array([0, 1, 15, 16, 255]))).toBe('y:00010f10ff');
		expect(serializeParam(new Uint8Array())).toBe('y:');
		expect(serializeParam(new Uint8Array([9, 8, 7]).subarray(1))).toBe('y:0807');
		expect(serializeParam(new Uint8Array([9, 8, 7]).subarray(1, 1))).toBe('y:');
		// UInt8Array & Buffer produce same params in drivers
		expect(serializeParam(Buffer.from([0xde, 0xad]))).toBe(serializeParam(new Uint8Array([0xde, 0xad])));
		expect(serializeParam([new Uint8Array([1, 2]), new Uint8Array([3])])).not.toBe(
			serializeParam([new Uint8Array([1]), new Uint8Array([2, 3])]),
		);
		expect(serializeParam(new Uint8Array([1, 2]))).not.toBe(serializeParam(new Uint8Array([1, 3])));
	});

	test('large byte views', ({ expect }) => {
		for (const size of [65536, 65537, 16384 * 5 + 3, 1024 * 1024]) {
			const bytes = new Uint8Array(size);
			for (let i = 0; i < size; i++) bytes[i] = (i * 131) & 255;
			expect(serializeParam(bytes)).toBe('y:' + Buffer.from(bytes).toString('hex'));

			const view = bytes.subarray(7, size - 5);
			expect(serializeParam(view)).toBe('y:' + Buffer.from(view).toString('hex'));
		}
	});

	test('byte views of different types stay distinct', ({ expect }) => {
		const views = [
			new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
			new Int8Array([1, 0, 0, 0, 0, 0, 0, 0]),
			new Uint8ClampedArray([1, 0, 0, 0, 0, 0, 0, 0]),
			new Uint16Array([1, 0, 0, 0]),
			new Int16Array([1, 0, 0, 0]),
			new Uint32Array([1, 0]),
			new Int32Array([1, 0]),
			new BigUint64Array([1n]),
			new BigInt64Array([1n]),
			new DataView(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]).buffer),
		];
		const keys = views.map(serializeParam);
		expect(new Set(keys).size).toBe(views.length);

		expect(serializeParam(new Int8Array([-1]))).not.toBe(serializeParam(new Uint8Array([255])));
		expect(serializeParam(new Float32Array([0]))).not.toBe(serializeParam(new Uint32Array([0])));
		expect(serializeParam(new Float64Array([0]))).not.toBe(serializeParam(new BigUint64Array([0n])));
		expect(serializeParam(new Uint16Array([0x0102]).subarray(0))).toBe('yu16:0201');
	});

	test('same input hashes deterministically', async ({ expect }) => {
		const params = [1, 'a', null, 5n, [true, { x: 2n ** 64n }]];
		expect(await hashQuery(query, params)).toBe(await hashQuery(query, structuredClone(params)));
		expect(await hashQuery(query, params)).not.toBe(await hashQuery('select ?, ?', params));
	});
});
