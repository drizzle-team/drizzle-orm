import { expectTypeOf } from 'bun:test';
import { pulse } from '../src/index.js';
import type { PulseBuilder } from '../src/server/pulse-builder.js';
import { createPulseRegistry } from '../src/server/pulse-registry.js';
import type { QueryDescriptor } from '../src/types.js';
import { driverSchema, orders, statusSchema } from './fixtures.js';

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

const defaultQuery = pulse(orders).query();
const includeColumnsQuery = pulse(orders).query().columns({ id: true, pickup: true });
const excludeColumnsQuery = pulse(orders).query().columns({ price: false, acceptedAt: false });
const statusArgsQuery = pulse(orders).query().args(statusSchema);
const replacedArgsQuery = pulse(orders).query().args(statusSchema).args(driverSchema);
const transformedQuery = pulse(orders)
  .query()
  .transform((rows) => {
    const rowsCheck: OrderRow[] = rows;
    return rowsCheck;
  });
void pulse(orders).query().order('asc');
void pulse(orders).query().order('desc');
void pulse(orders).query().limit(10);
const noArgsQuery = pulse(orders).query((_ctx) => null);
const fullChainQuery = pulse(orders)
  .query()
  .columns({ id: true, status: true, price: true })
  .args(statusSchema)
  .order('desc')
  .limit(20)
  .query((ctx) => ctx.query({ status: ctx.args.status }));
const defaultRegistry = createPulseRegistry({ allOrders: defaultQuery });

expectTypeOf(defaultQuery).toEqualTypeOf<
  PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, OrderRow>
>();
expectTypeOf(defaultQuery._.result).toEqualTypeOf<OrderRow>();
expectTypeOf<ReturnType<typeof defaultRegistry.$client.allOrders>>().toEqualTypeOf<
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

type IncludeResult = typeof includeColumnsQuery._.result;
expectTypeOf<IncludeResult['id']>().toEqualTypeOf<number>();
expectTypeOf<IncludeResult['pickup']>().toEqualTypeOf<string>();
// @ts-expect-error excluded by include-mode selection
type _IncludeNoDropoff = IncludeResult['dropoff'];

type ExcludeResult = typeof excludeColumnsQuery._.result;
expectTypeOf<ExcludeResult['id']>().toEqualTypeOf<number>();
expectTypeOf<ExcludeResult['pickup']>().toEqualTypeOf<string>();
// @ts-expect-error excluded by exclude-mode selection
type _ExcludeNoPrice = ExcludeResult['price'];
// @ts-expect-error excluded by exclude-mode selection
type _ExcludeNoAcceptedAt = ExcludeResult['acceptedAt'];

expectTypeOf(statusArgsQuery).toEqualTypeOf<
  PulseBuilder<
    typeof orders,
    Record<never, boolean>,
    { status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
    OrderRow
  >
>();
expectTypeOf(replacedArgsQuery).toEqualTypeOf<
  PulseBuilder<typeof orders, Record<never, boolean>, { driverId: number }, OrderRow>
>();

expectTypeOf(transformedQuery).toEqualTypeOf<
  PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, OrderRow>
>();

const transformedShapeQuery = pulse(orders)
  .query()
  .transform((rows) => rows.map((row) => ({ id: row.id, statusLabel: row.status.toUpperCase() })));
expectTypeOf(transformedShapeQuery._.result).toEqualTypeOf<{
  id: number;
  statusLabel: string;
}>();

const transformedRegistry = createPulseRegistry({ transformedShapeQuery });
expectTypeOf<ReturnType<typeof transformedRegistry.$client.transformedShapeQuery>>().toEqualTypeOf<
  QueryDescriptor<{
    id: number;
    statusLabel: string;
    $pk: unknown;
  }>
>();

// @ts-expect-error invalid order direction
pulse(orders).query().order('sideways');
// @ts-expect-error limit expects number
pulse(orders).query().limit('10');

type FullChainResult = typeof fullChainQuery._.result;
expectTypeOf<FullChainResult['id']>().toEqualTypeOf<number>();
expectTypeOf<FullChainResult['status']>().toEqualTypeOf<
  'requested' | 'accepted' | 'completed' | 'cancelled'
>();
expectTypeOf<FullChainResult['price']>().toEqualTypeOf<number>();
// @ts-expect-error pickup not selected
type _FullChainNoPickup = FullChainResult['pickup'];

expectTypeOf(defaultQuery).toEqualTypeOf<
  PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, OrderRow>
>();
expectTypeOf(statusArgsQuery).toEqualTypeOf<
  PulseBuilder<
    typeof orders,
    Record<never, boolean>,
    { status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
    OrderRow
  >
>();
expectTypeOf(noArgsQuery).toEqualTypeOf<
  PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, OrderRow>
>();
