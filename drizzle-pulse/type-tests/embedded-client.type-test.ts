import { expectTypeOf } from 'bun:test';
import {
  createPulseClient,
  type EmbeddedPulseClient,
  type PulseCollection,
  type PulseCollectionOptions,
  type PulseRow,
} from '../src/client/embedded/index.js';
import { pulse } from '../src/index.js';
import { createPulseRegistry } from '../src/server/pulse-registry.js';
import type { PulseRuntime } from '../src/server/pulse-runtime.js';
import { driverSchema, orders, statusSchema } from './fixtures.js';

// ---------------------------------------------------------------------------
// Build registry (mirrors registry-client.type-test.ts)
// ---------------------------------------------------------------------------

const withArgs = pulse(orders)
  .query()
  .args(statusSchema)
  .query((ctx) => ctx.query({ status: ctx.args.status }));
const noArgs = pulse(orders).query();

// Compile check only: the builders must satisfy createPulseRegistry's constraints.
createPulseRegistry({ withArgs, noArgs });

// ---------------------------------------------------------------------------
// Runtime (type-only: declared, not constructed — tsc --noEmit only)
// ---------------------------------------------------------------------------

declare const runtime: PulseRuntime<{ withArgs: typeof withArgs; noArgs: typeof noArgs }>;

// ---------------------------------------------------------------------------
// Client inference — no explicit generic required
// ---------------------------------------------------------------------------

// createPulseClient infers TQueries from the runtime; no <TQueries> generic needed.
const client = createPulseClient(runtime);

expectTypeOf<typeof client>().toEqualTypeOf<
  EmbeddedPulseClient<{ withArgs: typeof withArgs; noArgs: typeof noArgs }>
>();

// ---------------------------------------------------------------------------
// Call shapes mirror PulseClientContract
// ---------------------------------------------------------------------------

// Args query: (args, options?) → Promise<PulseCollection<FullRow>>. Embedded rows carry no
// $pk — the wire-only identity key is stripped from the contract shape.
const withArgsPromise = client.withArgs({ status: 'requested' });
expectTypeOf(withArgsPromise).toMatchTypeOf<
  Promise<
    PulseCollection<{
      id: number;
      driverId: number | null;
      pickup: string;
      dropoff: string;
      price: number;
      status: 'requested' | 'accepted' | 'completed' | 'cancelled';
      acceptedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >
>();

// No-args query: (options?) → Promise<PulseCollection<FullRow>>
// Asserted via list()'s row shape rather than the collection type itself: PulseCollection
// carries an @internal `core` field (stripped from the published .d.ts by stripInternal)
// whose private innards make different PulseCollection<T> instantiations non-comparable at
// the source level, so a partial-shape toMatchTypeOf on the collection itself no longer
// typechecks against source. list()'s return type has no such entanglement.
declare const noArgsCollection: Awaited<ReturnType<typeof client.noArgs>>;
expectTypeOf(noArgsCollection.list()[0]).toMatchTypeOf<
  | {
      id: number;
    }
  | undefined
>();

// ---------------------------------------------------------------------------
// PulseRow<C> extracts the row type — from the factory's promise and from the
// awaited collection alike
// ---------------------------------------------------------------------------

type WithArgsRow = PulseRow<typeof withArgsPromise>;
expectTypeOf<WithArgsRow['id']>().toEqualTypeOf<number>();
expectTypeOf<WithArgsRow['status']>().toEqualTypeOf<
  'requested' | 'accepted' | 'completed' | 'cancelled'
>();
// @ts-expect-error $pk is stripped from embedded rows
type _NoPk = WithArgsRow['$pk'];

// The awaited collection resolves to the same row type as the promise form.
expectTypeOf<PulseRow<Awaited<typeof withArgsPromise>>>().toEqualTypeOf<WithArgsRow>();

// PulseRow<never> (non-PulseCollection) resolves to never.
expectTypeOf<PulseRow<string>>().toEqualTypeOf<never>();

// ---------------------------------------------------------------------------
// Trailing PulseCollectionOptions is accepted
// ---------------------------------------------------------------------------

// The trailing options slot is exactly PulseCollectionOptions (args query: slot 1).
expectTypeOf<Parameters<typeof client.withArgs>[1]>().toEqualTypeOf<
  PulseCollectionOptions | undefined
>();

// Optional auth context accepted on args query
client.withArgs({ status: 'accepted' }, { auth: { userId: 7 } });
// Options alone (no userId)
client.withArgs({ status: 'accepted' }, {});
// No-args query also accepts options
client.noArgs({ auth: { userId: null } });

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

// @ts-expect-error args query requires the first positional arg
client.withArgs();

// @ts-expect-error passing a non-options object (unknown property) to the options slot of a no-args query
client.noArgs({ driverId: 42 });

// Verify that a selected-columns registry also infers correctly.
const selectedQueries = {
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
};
declare const selectedRuntime: PulseRuntime<typeof selectedQueries>;
const selectedClient = createPulseClient(selectedRuntime);

type ByStatusResult = PulseRow<ReturnType<typeof selectedClient.byStatus>>;
expectTypeOf<ByStatusResult['id']>().toEqualTypeOf<number>();
expectTypeOf<ByStatusResult['status']>().toEqualTypeOf<
  'requested' | 'accepted' | 'completed' | 'cancelled'
>();
// @ts-expect-error pickup is not in the selected columns
type _NoPickup = ByStatusResult['pickup'];
