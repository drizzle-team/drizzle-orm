/**
 * The `client` option: a pool from the standalone `@drizzle-team/postgres` package runs the
 * admin queries and the replication, so Pulse never uses the driver that `drizzle-orm` bundles.
 * The functions of the bundled driver that open connections are replaced with functions that
 * throw. A runtime without `client` fails on them, which shows that the replacement is in effect.
 */

import { createPool } from '@drizzle-team/postgres';
import { afterAll, describe, expect, mock, test } from 'bun:test';
import * as bundledDriverModule from 'drizzle-orm/postgres';
import * as bundledCdcModule from 'drizzle-orm/postgres/cdc';
import { drizzle } from 'drizzle-orm/postgres/core';
import { pulse } from 'drizzle-pulse';
import { createRuntime, LogLevel, provision, type PulseEvent } from 'drizzle-pulse/embedded';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

const ordersByStatus = pulse(orders)
	.args(ordersByStatusArgsSchema)
	.order('asc')
	.query((ctx) => ctx.query({ status: ctx.args.status }));

// Copies, because a module namespace shows the mocked exports while the mock is active.
const bundledDriver = { ...bundledDriverModule };
const bundledCdc = { ...bundledCdcModule };

const BUNDLED_DRIVER_USED = 'the bundled driver was used';
const fail = (): never => {
	throw new Error(BUNDLED_DRIVER_USED);
};

afterAll(() => {
	mock.module('drizzle-orm/postgres', () => bundledDriver);
	mock.module('drizzle-orm/postgres/cdc', () => bundledCdc);
});

describe('drizzle-pulse/embedded with a client pool', () => {
	test('live collections and CDC event streams run on the client pool only', async () => {
		const scenario = await createScenarioDb('pulse_client_pool');
		const pool = createPool(withQuietPostgresUrl(scenario.databaseUrl));
		const wal = { publicationName: 'client_pool_pub', slotName: 'client_pool_slot' };
		mock.module('drizzle-orm/postgres', () => ({
			...bundledDriver,
			createPool: fail,
			connect: fail,
			replication: fail,
		}));
		mock.module('drizzle-orm/postgres/cdc', () => ({ ...bundledCdc, replicate: fail }));
		try {
			const withoutClient = createRuntime({
				queries: { ordersByStatus },
				databaseUrl: scenario.databaseUrl,
				sourceDb: drizzle({ client: pool }),
				wal,
				logLevel: LogLevel.Error,
			});
			await expect(withoutClient.start()).rejects.toThrow(BUNDLED_DRIVER_USED);

			await provision({ queries: { ordersByStatus }, client: pool, wal });

			const runtime = createRuntime({
				queries: { ordersByStatus },
				client: pool,
				sourceDb: drizzle({ client: pool }),
				wal,
				logLevel: LogLevel.Error,
			});
			await runtime.start();

			const collection = await runtime.client.ordersByStatus({ status: 'accepted' });
			const events: PulseEvent<unknown>[] = [];
			const unsubscribe = runtime.events.ordersByStatus({ status: 'accepted' }, (event) => {
				events.push(event);
			});

			await scenario.sql.unsafe(
				`INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
			);
			await waitFor(() => collection.list().length === 1 && events.length === 1);
			expect(collection.list()[0]?.status).toBe('accepted');
			expect(events[0]?.op).toBe('insert');

			unsubscribe();
			collection.dispose();
			await runtime.stop();

			// The pool belongs to the app, so stop() leaves it open.
			expect((await pool.query('select 1')).rows).toHaveLength(1);
		} finally {
			mock.module('drizzle-orm/postgres', () => bundledDriver);
			mock.module('drizzle-orm/postgres/cdc', () => bundledCdc);
			await pool.end();
			await scenario.drop();
		}
	});
});
