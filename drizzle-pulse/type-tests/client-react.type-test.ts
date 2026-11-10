import { expectTypeOf } from 'bun:test';
import { createPulseClient } from '../src/client/index.js';
import type { UsePulseQueryResult, usePulseQuery } from '../src/client/react/index.js';
import type { usePulseQuery as usePulseQueryFromReact } from '../src/client/react/use-pulse-query.js';
import { pulse, type QueryDescriptor } from '../src/index.js';
import { createPulseRegistry } from '../src/server/pulse-registry.js';
import type { WithPk } from '../src/server/pulse-types.js';
import { orders, statusSchema } from './fixtures.js';

const registry = createPulseRegistry({
  ordersByStatus: pulse(orders)
    .query()
    .columns({ id: true, status: true })
    .args(statusSchema)
    .query((ctx) => ctx.query({ status: ctx.args.status })),
  allOrders: pulse(orders).query(),
});

type Client = typeof registry.$client;
const pulseClient = createPulseClient<Client>({ url: '/api/pulse' });

const statusDescriptor = pulseClient.ordersByStatus({ status: 'requested' });
const allOrdersDescriptor = pulseClient.allOrders();
// @ts-expect-error no-args pulse query must not accept an empty object
pulseClient.allOrders({});

expectTypeOf(statusDescriptor).toEqualTypeOf<
  QueryDescriptor<{
    id: number;
    status: 'requested' | 'accepted' | 'completed' | 'cancelled';
    $pk: unknown;
  }>
>();

expectTypeOf(allOrdersDescriptor).toEqualTypeOf<
  QueryDescriptor<{
    id: number;
    driverId: number | null;
    pickup: string;
    dropoff: string;
    price: number;
    status: 'requested' | 'accepted' | 'completed' | 'cancelled';
    acceptedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    $pk: unknown;
  }>
>();

expectTypeOf<typeof usePulseQuery>().toEqualTypeOf<
  <TResult extends WithPk<Record<string, unknown>>>(
    descriptor: QueryDescriptor<TResult>,
  ) => UsePulseQueryResult<TResult>
>();
expectTypeOf<typeof usePulseQueryFromReact>().toEqualTypeOf<
  <TResult extends WithPk<Record<string, unknown>>>(
    descriptor: QueryDescriptor<TResult>,
  ) => UsePulseQueryResult<TResult>
>();

expectTypeOf<ReturnType<typeof usePulseQuery<{ id: number; $pk: unknown }>>>().toEqualTypeOf<
  UsePulseQueryResult<{ id: number; $pk: unknown }>
>();
