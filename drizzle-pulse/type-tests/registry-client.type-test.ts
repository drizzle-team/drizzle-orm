import { expectTypeOf } from 'bun:test';
import { createPulseClient } from '../src/client/index.js';
import { pulse } from '../src/index.js';
import { createPulseRegistry } from '../src/server/pulse-registry.js';
import type { QueryDescriptor } from '../src/types.js';
import { driverSchema, orders, statusSchema } from './fixtures.js';

const withArgs = pulse(orders)
  .query()
  .args(statusSchema)
  .query((ctx) => ctx.query({ status: ctx.args.status }));
const noArgs = pulse(orders).query();
const registry = createPulseRegistry({ withArgs, noArgs });
type Client = typeof registry.$client;

expectTypeOf<Client['withArgs']>().toEqualTypeOf<
  (args: { status: 'requested' | 'accepted' | 'completed' | 'cancelled' }) => QueryDescriptor<{
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
expectTypeOf<Client['noArgs']>().toEqualTypeOf<
  () => QueryDescriptor<{
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

const selectedRegistry = createPulseRegistry({
  withArgs: pulse(orders)
    .query()
    .columns({ id: true, status: true })
    .args(statusSchema)
    .query((ctx) => ctx.query({ status: ctx.args.status })),
});
type SelectedClient = typeof selectedRegistry.$client;
const client = createPulseClient<SelectedClient>({ url: '/api/pulse' });
const descriptor = client.withArgs({ status: 'requested' });

expectTypeOf(descriptor).toEqualTypeOf<
  QueryDescriptor<{
    id: number;
    status: 'requested' | 'accepted' | 'completed' | 'cancelled';
    $pk: unknown;
  }>
>();
type DescriptorResult = typeof descriptor._.result;
expectTypeOf<DescriptorResult['$pk']>().toEqualTypeOf<unknown>();
expectTypeOf<DescriptorResult['id']>().toEqualTypeOf<number>();
expectTypeOf<DescriptorResult['status']>().toEqualTypeOf<
  'requested' | 'accepted' | 'completed' | 'cancelled'
>();
// @ts-expect-error pickup not selected
type _DescriptorNoPickup = DescriptorResult['pickup'];

const driverRegistry = createPulseRegistry({
  byDriver: pulse(orders)
    .query()
    .args(driverSchema)
    .query((ctx) => ctx.query({ driverId: ctx.args.driverId })),
});
type DriverClient = typeof driverRegistry.$client;
const driverClient = createPulseClient<DriverClient>({ url: '/api' });
driverClient.byDriver({ driverId: 42 });
// @ts-expect-error missing required args
driverClient.byDriver();
// @ts-expect-error wrong arg shape
driverClient.byDriver({ status: 'foo' });
registry.$client.noArgs();
// @ts-expect-error no-args queries must not accept an empty object
registry.$client.noArgs({});

type Row = {
  id: number;
  pickup: string;
  $pk: unknown;
};
expectTypeOf<Row['$pk']>().toEqualTypeOf<unknown>();
expectTypeOf<Row['id']>().toEqualTypeOf<number>();
expectTypeOf<Row['pickup']>().toEqualTypeOf<string>();
// @ts-expect-error dropoff not selected
type _RowNoDropoff = Row['dropoff'];

const multiRegistry = createPulseRegistry({
  byStatus: pulse(orders)
    .query()
    .columns({ id: true, status: true })
    .args(statusSchema)
    .query((ctx) => ctx.query({ status: ctx.args.status })),
  byDriver: pulse(orders)
    .query()
    .columns({ id: true, driverId: true })
    .args(driverSchema)
    .query((ctx) => ctx.query({ driverId: ctx.args.driverId })),
  all: pulse(orders).query(),
});
type MultiClient = typeof multiRegistry.$client;
expectTypeOf<keyof MultiClient>().toEqualTypeOf<'byStatus' | 'byDriver' | 'all'>();
type ByStatusResult =
  ReturnType<MultiClient['byStatus']> extends QueryDescriptor<infer R> ? R : never;
expectTypeOf<ByStatusResult['status']>().toEqualTypeOf<
  'requested' | 'accepted' | 'completed' | 'cancelled'
>();
// @ts-expect-error pickup not selected
type _ByStatusNoPickup = ByStatusResult['pickup'];
type ByDriverResult =
  ReturnType<MultiClient['byDriver']> extends QueryDescriptor<infer R> ? R : never;
expectTypeOf<ByDriverResult['driverId']>().toEqualTypeOf<number | null>();
