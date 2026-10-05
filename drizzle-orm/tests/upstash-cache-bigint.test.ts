import { describe, expect, it } from 'vitest';
import { UpstashCache } from '~/cache/upstash/cache.ts';

// Regression tests for #6395 (Upstash path). `UpstashCache.put()` hands the
// response to `pipeline.hset`, and `@upstash/redis` serializes payloads with
// `JSON.stringify` internally — which throws on BigInt column values before the
// fix wrapped the payload in `bigintsToStrings`.
//
// Following the repo's dependency-injection style (the cache accepts a `Redis`
// instance in its constructor), we pass a small fake client instead of standing
// up a new mocking layer. The fake's `hset` calls `JSON.stringify` exactly like
// the real client, so an un-converted BigInt still throws — the test genuinely
// fails without the fix.

interface HsetCall {
	key: string;
	field: string;
	// Throws on BigInt payloads, mirroring @upstash/redis' internal serialization.
	json: string;
}

function createFakeRedis() {
	const hsetCalls: HsetCall[] = [];
	const stored = new Map<string, string>();

	const makePipeline = () => {
		const pipeline: any = {
			hset(key: string, value: Record<string, any>) {
				for (const [field, payload] of Object.entries(value)) {
					// JSON.stringify here is what reproduces the original crash when a
					// BigInt survives into the payload.
					const json = JSON.stringify(payload);
					hsetCalls.push({ key, field, json });
					stored.set(`${key}\u0000${field}`, json);
				}
				return pipeline;
			},
			hexpire() {
				return pipeline;
			},
			sadd() {
				return pipeline;
			},
			async exec() {
				return [];
			},
		};
		return pipeline;
	};

	const redis: any = {
		createScript: () => ({ exec: async () => null }),
		pipeline: makePipeline,
		async hget(key: string, field: string) {
			const raw = stored.get(`${key}\u0000${field}`);
			return raw === undefined ? null : JSON.parse(raw);
		},
	};

	return { redis, hsetCalls, stored };
}

describe.concurrent('UpstashCache.put with BigInt responses', () => {
	it('stores a BigInt-free payload on the auto-invalidate (composite key) path', async ({ expect }) => {
		const { redis, hsetCalls } = createFakeRedis();
		const cache = new UpstashCache(redis);

		const response = [{ id: 9007199254740993n, count: 1n, name: 'row' }];
		await expect(cache.put('hash-1', response, ['users'], false)).resolves.toBeUndefined();

		expect(hsetCalls).toHaveLength(1);
		const [call] = hsetCalls;
		// BigInts were converted to strings before serialization.
		expect(JSON.parse(call.json)).toEqual([{ id: '9007199254740993', count: '1', name: 'row' }]);
	});

	it('stores a BigInt-free payload on the non-auto-invalidate path', async ({ expect }) => {
		const { redis, hsetCalls } = createFakeRedis();
		const cache = new UpstashCache(redis);

		const response = { total: 42n };
		// Empty tables => isAutoInvalidate === false => the other hset site.
		await expect(cache.put('hash-2', response, [], false)).resolves.toBeUndefined();

		const valueCall = hsetCalls.find((c) => c.key === '__nonAutoInvalidate__');
		expect(valueCall).toBeDefined();
		expect(JSON.parse(valueCall!.json)).toEqual({ total: '42' });
	});

	it('does not throw and reads values back as strings (documented type asymmetry)', async ({ expect }) => {
		const { redis } = createFakeRedis();
		const cache = new UpstashCache(redis);

		await cache.put('hash-3', [{ id: 7n }], ['posts'], false);

		// Reading back must not throw, but BigInt columns come back as STRINGS, not
		// BigInts — the fix normalizes on write only. This is reported as a known
		// limitation rather than papered over.
		const result = await cache.get('hash-3', ['posts'], false, true);
		expect(result).toEqual([{ id: '7' }]);
		expect(typeof result[0].id).toBe('string');
	});
});
