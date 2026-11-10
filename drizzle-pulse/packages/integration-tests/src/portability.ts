// Declaration-emit portability check, compiled by tsconfig.portability.json (never executed):
// exporting a builder or a runtime whose inferred type references builder internals must be
// nameable through public entrypoints alone — a reference to a dist-internal module path fails
// the build here ("The inferred type of X cannot be named...").
import { pulse } from 'drizzle-pulse';
import { createRuntime, type PulseSourceDb } from 'drizzle-pulse/embedded';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';

declare const sourceDb: PulseSourceDb;

export const ordersByStatus = pulse(orders)
  .args(ordersByStatusArgsSchema)
  .query((ctx) => ctx.query({ status: ctx.args.status }));

export const runtime = createRuntime({
  queries: { ordersByStatus },
  databaseUrl: 'postgres://unused',
  sourceDb,
});
