import { expectTypeOf } from 'bun:test';
import {
  createRuntime,
  type EmbeddedPulseClient,
  type EmbeddedPulseEvents,
  LogLevel,
  type PulseRow,
  type PulseSourceDb,
} from '../src/embedded/index.js';
import { pulse } from '../src/index.js';
import { orders, statusSchema } from './fixtures.js';

declare const sourceDb: PulseSourceDb;

// ---------------------------------------------------------------------------
// Build queries (mirrors embedded-client.type-test.ts)
// ---------------------------------------------------------------------------

const withArgs = pulse(orders)
  .query()
  .args(statusSchema)
  .query((ctx) => ctx.query({ status: ctx.args.status }));
const noArgs = pulse(orders).query();

// ---------------------------------------------------------------------------
// Factory inference — no explicit generic required, full config accepted
// ---------------------------------------------------------------------------

const runtime = createRuntime({
  queries: { withArgs, noArgs },
  databaseUrl: 'postgres://unused',
  sourceDb,
  wal: { publicationName: 'pub', slotName: 'slot' },
  logLevel: LogLevel.Error,
});

expectTypeOf<typeof runtime.client>().toEqualTypeOf<
  EmbeddedPulseClient<{ withArgs: typeof withArgs; noArgs: typeof noArgs }>
>();
expectTypeOf<typeof runtime.events>().toEqualTypeOf<
  EmbeddedPulseEvents<{ withArgs: typeof withArgs; noArgs: typeof noArgs }>
>();

expectTypeOf(runtime.start).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(runtime.stop).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(runtime.provision).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(runtime.onFatalError).toEqualTypeOf<
  (listener: (error: Error) => void) => () => void
>();

// ---------------------------------------------------------------------------
// Row shapes flow through the client, without $pk
// ---------------------------------------------------------------------------

type WithArgsRow = PulseRow<ReturnType<typeof runtime.client.withArgs>>;
expectTypeOf<WithArgsRow['id']>().toEqualTypeOf<number>();
expectTypeOf<WithArgsRow['status']>().toEqualTypeOf<
  'requested' | 'accepted' | 'completed' | 'cancelled'
>();
// @ts-expect-error $pk is stripped from embedded rows
type _NoPk = WithArgsRow['$pk'];

// ---------------------------------------------------------------------------
// Config has no pull knob; queries, databaseUrl, and sourceDb are required
// ---------------------------------------------------------------------------

// @ts-expect-error pull is not a knob on the embedded runtime
createRuntime({ queries: { noArgs }, databaseUrl: 'postgres://unused', sourceDb, pull: false });

// @ts-expect-error sourceDb is required
createRuntime({ queries: { noArgs }, databaseUrl: 'postgres://unused' });

// @ts-expect-error databaseUrl is required
createRuntime({ queries: { noArgs }, sourceDb });

// @ts-expect-error queries is required
createRuntime({ databaseUrl: 'postgres://unused', sourceDb });
