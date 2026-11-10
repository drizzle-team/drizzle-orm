import { expectTypeOf } from 'bun:test';
import { pulse } from '../src/pulse-table.js';
import type { PulseBuilder } from '../src/server/pulse-builder.js';
import { orders, statusSchema } from './fixtures.js';

type OrderRow = {
  id: number;
  driverId: number | null;
  pickup: string;
  dropoff: string;
  price: number;
  status: 'requested' | 'accepted' | 'completed' | 'cancelled';
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Spelling A (user-canonical): collection-level query fn reads args before `.args()` seeds
// the schema anywhere in the chain — args is intentionally permissive here (see pulse-table.ts).
const spellingA = pulse(orders)
  .query(({ query, args, auth }) => {
    expectTypeOf(auth).not.toBeAny();
    return query({ status: args.status });
  })
  .args(statusSchema);
expectTypeOf(spellingA).toEqualTypeOf<
  PulseBuilder<
    typeof orders,
    Record<never, boolean>,
    { status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
    OrderRow
  >
>();

// Spelling B (fully-typed args): `.args()` seeds the schema on the builder before the
// builder-level `.query()` runs, so `ctx.args.status` is the real narrowed union type,
// not the permissive `any` from the collection-level fn above.
const spellingB = pulse(orders)
  .query()
  .args(statusSchema)
  .order('desc')
  .limit(5)
  .query((ctx) => {
    expectTypeOf(ctx.args.status).toEqualTypeOf<
      'requested' | 'accepted' | 'completed' | 'cancelled'
    >();
    return ctx.query({ status: ctx.args.status });
  });
expectTypeOf(spellingB).toEqualTypeOf<
  PulseBuilder<
    typeof orders,
    Record<never, boolean>,
    { status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
    OrderRow
  >
>();

// Bare `pulse(orders).query()` compiles and is assignable where a PulseBuilder is expected.
const bareQuery = pulse(orders).query();
const asBuilder: PulseBuilder<
  typeof orders,
  Record<never, boolean>,
  Record<never, never>,
  OrderRow
> = bareQuery;
void asBuilder;

// @ts-expect-error pulse(table) takes exactly one argument
pulse(orders, {});
