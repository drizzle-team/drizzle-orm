import type { Client, InStatement } from '@libsql/client';
import { webcrypto } from 'node:crypto';
import { expect, test, vi } from 'vitest';

import { Cache, type MutationOption } from '~/cache/core/index.ts';
import { drizzle } from '~/libsql/index.ts';
import { sqliteTable, text } from '~/sqlite-core/index.ts';

if (!globalThis.crypto) {
	Object.defineProperty(globalThis, 'crypto', {
		value: webcrypto,
		configurable: true,
	});
}

// eslint-disable-next-line drizzle-internal/require-entity-kind
class JsonRoundTripCache extends Cache {
	private data = new Map<string, string>();

	override strategy(): 'explicit' | 'all' {
		return 'explicit';
	}

	override async get(key: string): Promise<any[] | undefined> {
		const stored = this.data.get(key);
		return stored === undefined ? undefined : JSON.parse(stored);
	}

	override async put(key: string, response: any): Promise<void> {
		this.data.set(key, JSON.stringify(response));
	}

	override async onMutate(_params: MutationOption): Promise<void> {}
}

function createArrayLikeLibSqlRow(payloadJson: string): Record<string, unknown> {
	const row: Record<string, unknown> = {
		payload: payloadJson,
	};

	Object.defineProperty(row, '0', {
		value: payloadJson,
		enumerable: false,
		writable: false,
	});
	Object.defineProperty(row, 'length', {
		value: 1,
		enumerable: false,
		writable: false,
	});

	return row;
}

test('libsql cached values survive JSON roundtrip', async () => {
	const table = sqliteTable('cache_roundtrip_users', {
		payload: text('payload', { mode: 'json' }).$type<{ a: number }>(),
	});

	const execute = vi.fn(async (_statement: InStatement) => {
		return {
			rows: [createArrayLikeLibSqlRow('{"a":1}')],
		};
	});

	const client = {
		execute,
	} as unknown as Client;

	const db = drizzle(client, { cache: new JsonRoundTripCache() });

	const first = await db.select().from(table).$withCache();
	const second = await db.select().from(table).$withCache();

	expect(first).toEqual([{ payload: { a: 1 } }]);
	expect(second).toEqual(first);
	expect(execute).toHaveBeenCalledTimes(1);
});
