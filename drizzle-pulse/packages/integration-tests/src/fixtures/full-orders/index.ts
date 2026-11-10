import { fileURLToPath } from 'node:url';
import { buildEventsTable } from 'drizzle-pulse/server';
import { orders, ordersByStatusArgsSchema, users } from './schema.js';

export type HarnessOrderStatus = 'requested' | 'accepted' | 'completed' | 'cancelled';

const migrationsDir = fileURLToPath(new URL('./drizzle', import.meta.url));

export const fullOrdersFixture = {
  variantName: 'full-orders' as const,
  migrationsPath: migrationsDir,
  eventsTable: buildEventsTable(orders),
  pulsedTables: [orders],
  cleanupTables: ['orders', 'users'] as const,
  publicationName: 'fixture_full_orders_pub' as const,
  tables: {
    orders,
    users,
  },
  schemas: {
    ordersByStatusArgs: ordersByStatusArgsSchema,
  },
};
