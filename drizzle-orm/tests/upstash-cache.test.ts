import type { Redis } from '@upstash/redis';
import { expect, test } from 'vitest';
import { UpstashCache } from '~/cache/upstash/cache.ts';

function createCache() {
	const hsetCalls: [string, Record<string, unknown>][] = [];
	const pipeline = {
		// Mimics @upstash/redis, which serializes hset values with JSON.stringify
		hset(key: string, value: Record<string, unknown>) {
			JSON.stringify(value);
			hsetCalls.push([key, value]);
			return pipeline;
		},
		hexpire: () => pipeline,
		sadd: () => pipeline,
		exec: async () => [],
	};
	const redis = {
		pipeline: () => pipeline,
		createScript: () => ({ exec: async () => null }),
	} as unknown as Redis;

	return { cache: new UpstashCache(redis), hsetCalls };
}

const rows = [{ id: 1n, name: 'a', nested: { ids: [2n, 3n] } }];
const expected = [{ id: '1', name: 'a', nested: { ids: ['2', '3'] } }];

test('put with auto-invalidation does not fail on BigInt values', async () => {
	const { cache, hsetCalls } = createCache();

	await cache.put('key', rows, ['users'], false);

	expect(hsetCalls[0]![1]).toEqual({ key: expected });
});

test('put without auto-invalidation does not fail on BigInt values', async () => {
	const { cache, hsetCalls } = createCache();

	await cache.put('key', rows, [], true);

	expect(hsetCalls.at(-1)![1]).toEqual({ key: expected });
});
