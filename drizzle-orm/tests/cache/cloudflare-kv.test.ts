import { describe, expect, test } from 'vitest';
import { cloudflareKVCache } from '~/cache/cloudflare-kv/index.ts';
import { Table } from '~/table.ts';

type StoredValue = {
	value: string;
	options?: KVNamespacePutOptions;
};

class MockKVNamespace {
	readonly values = new Map<string, StoredValue>();

	async get<Value = unknown>(key: string, type?: string): Promise<Value | string | null> {
		const stored = this.values.get(key);
		if (stored === undefined) {
			return null;
		}
		return type === 'json' ? JSON.parse(stored.value) as Value : stored.value;
	}

	async put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void> {
		this.values.set(key, { value, options });
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
	}

	async list<Metadata = unknown>(
		options: KVNamespaceListOptions,
	): Promise<KVNamespaceListResult<Metadata>> {
		const keys = [...this.values]
			.filter(([key]) => key.startsWith(options.prefix ?? ''))
			.map(([name, stored]) => ({
				name,
				metadata: stored.options?.metadata as Metadata,
			}));
		return { keys, list_complete: true, cacheStatus: null };
	}

	asNamespace(): KVNamespace {
		return this as unknown as KVNamespace;
	}
}

function setup(options?: Parameters<typeof cloudflareKVCache>[1]) {
	const kv = new MockKVNamespace();
	return { kv, cache: cloudflareKVCache(kv.asNamespace(), options) };
}

describe('cloudflareKVCache', () => {
	test('uses the explicit strategy by default', () => {
		expect(setup().cache.strategy()).toBe('explicit');
		expect(setup({ strategy: 'all' }).cache.strategy()).toBe('all');
	});

	test('stores and retrieves query results', async () => {
		const { cache } = setup();
		const rows = [{ id: 1, name: 'Ada' }];

		await cache.put('hash', rows, [], false);

		expect(await cache.get('hash', [], false)).toEqual(rows);
		expect(await cache.get('missing', [], false)).toBeUndefined();
	});

	test('uses separate query and tag keys', async () => {
		const { cache } = setup({ prefix: 'app' });

		await cache.put('same-key', ['query'], [], false);
		await cache.put('same-key', ['tag'], [], true);

		expect(await cache.get('same-key', [], false)).toEqual(['query']);
		expect(await cache.get('same-key', [], true)).toEqual(['tag']);
	});

	test('uses the default and per-query expiration configs', async () => {
		const { cache, kv } = setup({ config: { ex: 600 } });

		await cache.put('default', [], [], false);
		await cache.put('override', [], [], false, { px: 120_000 });
		await cache.put('empty-override', [], [], false, {});

		expect(kv.values.get('drizzle:query:default')?.options?.expirationTtl).toBe(600);
		expect(kv.values.get('drizzle:query:override')?.options?.expirationTtl).toBe(120);
		expect(kv.values.get('drizzle:query:empty-override')?.options?.expirationTtl).toBe(600);
	});

	test('rejects expiration targets below the Cloudflare KV minimum', async () => {
		expect(() => setup({ config: { ex: 59 } })).toThrow(/at least 60 seconds/);

		const { cache } = setup();
		await expect(cache.put('hash', [], [], false, { px: 59_000 })).rejects.toThrow(/at least 60 seconds/);
	});

	test('invalidates tags directly', async () => {
		const { cache } = setup();
		await cache.put('dashboard', [{ value: 1 }], [], true);

		await cache.onMutate({ tags: 'dashboard' });

		expect(await cache.get('dashboard', [], true)).toBeUndefined();
	});

	test('invalidates all entries associated with a table', async () => {
		const { cache } = setup();
		await cache.put('users-1', [{ id: 1 }], ['users'], false);
		await cache.put('users-2', [{ id: 2 }], ['users'], false);
		await cache.put('posts', [{ id: 1 }], ['posts'], false);

		await cache.onMutate({ tables: 'users' });

		expect(await cache.get('users-1', [], false)).toBeUndefined();
		expect(await cache.get('users-2', [], false)).toBeUndefined();
		expect(await cache.get('posts', [], false)).toEqual([{ id: 1 }]);
	});

	test('keeps table index prefixes isolated', async () => {
		const { cache } = setup();
		await cache.put('users', [{ id: 1 }], ['users'], false);
		await cache.put('users-archive', [{ id: 2 }], ['users:archive'], false);

		await cache.onMutate({ tables: 'users' });

		expect(await cache.get('users', [], false)).toBeUndefined();
		expect(await cache.get('users-archive', [], false)).toEqual([{ id: 2 }]);
	});

	test('accepts Drizzle table objects during manual invalidation', async () => {
		const users = new Table('users', undefined, 'users');
		const { cache } = setup();
		await cache.put('users', [{ id: '1' }], ['users'], false);

		await cache.onMutate({ tables: users });

		expect(await cache.get('users', [], false)).toBeUndefined();
	});

	test('does not create table indexes when auto invalidation is disabled', async () => {
		const { cache, kv } = setup();

		await cache.put('hash', [], [], false);

		expect([...kv.values.keys()]).toEqual(['drizzle:query:hash']);
	});
});
