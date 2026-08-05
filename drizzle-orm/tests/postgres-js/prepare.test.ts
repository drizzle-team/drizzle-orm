import type { Sql } from 'postgres';
import postgres from 'postgres';
import { describe, test } from 'vitest';
import { integer, pgTable } from '~/pg-core/index.ts';
import { drizzle } from '~/postgres-js/index.ts';

const users = pgTable('users', {
	id: integer('id').primaryKey(),
});

function clientWithObservedUnsafeOptions(prepare: boolean) {
	const client = postgres('postgres://unused:unused@127.0.0.1:1/unused', { prepare }) as Sql & {
		observedUnsafeOptions: unknown[];
	};
	client.observedUnsafeOptions = [];
	// @ts-expect-error - replaced for observation, never opens a real connection
	client.unsafe = (_query: string, _params: unknown[], options?: unknown) => {
		client.observedUnsafeOptions.push(options);
		return { values: async () => [] };
	};
	return client;
}

describe.concurrent('postgres-js prepare option', () => {
	/**
	 * @see https://github.com/drizzle-team/drizzle-orm/issues/6096
	 */
	test('a client configured with prepare: true is passed through to unsafe()', async ({ expect }) => {
		const client = clientWithObservedUnsafeOptions(true);
		const db = drizzle(client);

		await db.select().from(users);

		expect(client.observedUnsafeOptions).toEqual([{ prepare: true }]);
	});

	test('a client configured with prepare: false is passed through to unsafe()', async ({ expect }) => {
		const client = clientWithObservedUnsafeOptions(false);
		const db = drizzle(client);

		await db.select().from(users);

		expect(client.observedUnsafeOptions).toEqual([{ prepare: false }]);
	});
});
