import { describe, test } from 'vitest';
import { drizzle } from '~/node-postgres/index.ts';

interface MockState {
	queries: string[];
	released: number;
	connects: number;
}

function createMockPool(
	query: (text: string, state: MockState) => Promise<unknown>,
): { pool: any; state: MockState } {
	const state: MockState = { queries: [], released: 0, connects: 0 };

	const client = {
		query: async (config: { text: string }, _params?: unknown[]) => {
			state.queries.push(config.text);
			return await query(config.text, state);
		},
		release: () => {
			state.released++;
		},
	};

	// Class name contains "Pool" so the driver's pool detection
	// (`constructor.name.includes('Pool')`) treats it as a pool.
	class MockPool {
		connect = async () => {
			state.connects++;
			return client;
		};
	}

	return { pool: new MockPool() as any, state };
}

const okResult = { rows: [], rowCount: 0, command: '', fields: [] };

describe('node-postgres transaction pool client release', () => {
	test('releases the pool client when BEGIN rejects and does not send ROLLBACK', async ({ expect }) => {
		const beginError = new Error('connection interrupted');
		const { pool, state } = createMockPool(async (text) => {
			if (text.trim().toLowerCase().startsWith('begin')) {
				throw beginError;
			}
			return okResult;
		});
		const db = drizzle(pool);

		await expect(db.transaction(async () => undefined)).rejects.toThrowError();

		expect(state.connects).toBe(1);
		expect(state.released).toBe(1);
		expect(state.queries).toEqual(['begin']);
	});

	test('releases the pool client exactly once on commit', async ({ expect }) => {
		const { pool, state } = createMockPool(async () => okResult);
		const db = drizzle(pool);

		await db.transaction(async () => undefined);

		expect(state.connects).toBe(1);
		expect(state.released).toBe(1);
		expect(state.queries).toEqual(['begin', 'commit']);
	});

	test('rolls back and releases the pool client when the callback throws', async ({ expect }) => {
		const { pool, state } = createMockPool(async () => okResult);
		const db = drizzle(pool);
		const callbackError = new Error('boom');

		await expect(
			db.transaction(async () => {
				throw callbackError;
			}),
		).rejects.toThrowError(callbackError);

		expect(state.connects).toBe(1);
		expect(state.released).toBe(1);
		expect(state.queries).toEqual(['begin', 'rollback']);
	});
});
