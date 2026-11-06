import { expectTypeOf } from 'bun:test';
import type { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { drizzle as drizzlePostgres } from 'drizzle-orm/postgres';
import type { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js';
import {
	type AnyPulseBuilders,
	createRuntime,
	type EmbeddedPulseClient,
	type EmbeddedPulseEvents,
	type EmbeddedRuntime,
	type EmbeddedRuntimeConfig,
	LogLevel,
	provision,
	type PulseBuilder as EmbeddedPulseBuilder,
	PulseCollection,
	type PulseCollectionChange,
	type PulseDeleteEvent,
	type PulseEvent,
	type PulseEventsCallback,
	type PulseEventsOptions,
	type PulseInsertEvent,
	type PulseRow,
	type PulseRuntimeWalConfig,
	type PulseSourceDb,
	type PulseUpdateEvent,
	type TelemetryEvent,
} from '../src/embedded/index.js';
import { pulse, type PulseBuilder } from '../src/index.js';
import { orders, statusSchema } from './fixtures.js';

declare const sourceDb: PulseSourceDb;

type Status = 'requested' | 'accepted' | 'completed' | 'cancelled';
type OrderRow = {
	id: number;
	driverId: number | null;
	pickup: string;
	dropoff: string;
	price: number;
	status: Status;
	acceptedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
type IdStatusRow = { id: number; status: Status };

const withArgs = pulse(orders)
	.args(statusSchema)
	.query((ctx) => ctx.query({ status: ctx.args.status }));
const noArgs = pulse(orders).query();
const selected = pulse(orders).columns({ id: true, status: true });
const transformed = pulse(orders).transform((rows) => rows);
const limited = pulse(orders).limit(10);

const queries = { withArgs, noArgs, selected, transformed, limited };
type Queries = typeof queries;

// ---------------------------------------------------------------------------
// createRuntime, EmbeddedRuntimeConfig and EmbeddedRuntime
// ---------------------------------------------------------------------------

const config: EmbeddedRuntimeConfig<Queries> = {
	queries,
	databaseUrl: 'postgres://unused',
	sourceDb,
	wal: { publicationName: 'pub', slotName: 'slot' },
	logLevel: LogLevel.Error,
	telemetry: (event) => {
		expectTypeOf(event).toEqualTypeOf<TelemetryEvent>();
	},
};
const runtime = createRuntime(config);
expectTypeOf(runtime).toEqualTypeOf<EmbeddedRuntime<Queries>>();
expectTypeOf(runtime.client).toEqualTypeOf<EmbeddedPulseClient<Queries>>();
expectTypeOf(runtime.events).toEqualTypeOf<EmbeddedPulseEvents<Queries>>();
expectTypeOf(runtime.start).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(runtime.stop).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(runtime.provision).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(runtime.onFatalError).toEqualTypeOf<(listener: (error: Error) => void) => () => void>();

// @ts-expect-error pull is not an option of the embedded runtime
createRuntime({ queries, databaseUrl: 'postgres://unused', sourceDb, pull: false });
// @ts-expect-error sourceDb is required
createRuntime({ queries, databaseUrl: 'postgres://unused' });
// @ts-expect-error databaseUrl is required
createRuntime({ queries, sourceDb });
// @ts-expect-error queries is required
createRuntime({ databaseUrl: 'postgres://unused', sourceDb });

// ---------------------------------------------------------------------------
// provision
// ---------------------------------------------------------------------------

expectTypeOf(provision({ queries, databaseUrl: 'postgres://unused', wal: { publicationName: 'pub' } }))
	.toEqualTypeOf<Promise<void>>();
// @ts-expect-error provision needs no sourceDb
void provision({ queries, databaseUrl: 'postgres://unused', sourceDb });

// ---------------------------------------------------------------------------
// Queries with .transform() or .limit() cannot be opened
// ---------------------------------------------------------------------------

expectTypeOf<keyof EmbeddedPulseClient<Queries>>().toEqualTypeOf<'withArgs' | 'noArgs' | 'selected'>();
expectTypeOf<keyof EmbeddedPulseEvents<Queries>>().toEqualTypeOf<'withArgs' | 'noArgs' | 'selected'>();
// @ts-expect-error a .transform() query cannot open a live collection
void runtime.client.transformed;
// @ts-expect-error a .limit() query cannot open a CDC event stream
void runtime.events.limited;

// ---------------------------------------------------------------------------
// Live collections
// ---------------------------------------------------------------------------

expectTypeOf(runtime.client.withArgs).toEqualTypeOf<
	(args: { status: Status }) => Promise<PulseCollection<OrderRow>>
>();
expectTypeOf(runtime.client.noArgs).toEqualTypeOf<() => Promise<PulseCollection<OrderRow>>>();
expectTypeOf(runtime.client.selected).toEqualTypeOf<() => Promise<PulseCollection<IdStatusRow>>>();
// @ts-expect-error a query with args needs them
void runtime.client.withArgs();
// @ts-expect-error opening a live collection takes no options
void runtime.client.noArgs({ auth: { userId: 1 } });

expectTypeOf<PulseRow<ReturnType<typeof runtime.client.withArgs>>>().toEqualTypeOf<OrderRow>();
expectTypeOf<PulseRow<PulseCollection<IdStatusRow>>>().toEqualTypeOf<IdStatusRow>();
expectTypeOf<PulseRow<string>>().toEqualTypeOf<never>();

declare const collection: PulseCollection<IdStatusRow>;
expectTypeOf(collection.list).toEqualTypeOf<() => readonly IdStatusRow[]>();
expectTypeOf(collection.onChange).toEqualTypeOf<
	(listener: (change: PulseCollectionChange<IdStatusRow>) => void) => () => void
>();
expectTypeOf(collection.onError).toEqualTypeOf<(listener: (error: Error) => void) => () => void>();
expectTypeOf(collection.dispose).toEqualTypeOf<() => void>();
expectTypeOf<PulseCollectionChange<IdStatusRow>>().toEqualTypeOf<{
	events: readonly PulseEvent<IdStatusRow>[];
	state: readonly IdStatusRow[];
	lsn: string;
}>();

// PulseCollection is usable with instanceof, but only the runtime creates it.
declare const unknownValue: unknown;
if (unknownValue instanceof PulseCollection) {
	expectTypeOf(unknownValue.dispose).toEqualTypeOf<() => void>();
}
// @ts-expect-error the constructor is private
new PulseCollection();

// ---------------------------------------------------------------------------
// CDC event streams
// ---------------------------------------------------------------------------

expectTypeOf(runtime.events.withArgs).toEqualTypeOf<
	(
		args: { status: Status },
		callback: PulseEventsCallback<OrderRow>,
		options?: PulseEventsOptions,
	) => () => void
>();
expectTypeOf(runtime.events.selected).toEqualTypeOf<
	(callback: PulseEventsCallback<IdStatusRow>, options?: PulseEventsOptions) => () => void
>();
expectTypeOf<PulseEventsCallback<IdStatusRow>>().toEqualTypeOf<
	(event: PulseEvent<IdStatusRow>, lsn: string) => void
>();
expectTypeOf<PulseEventsOptions>().toEqualTypeOf<{
	onResync?: () => void;
	onError?: (error: Error) => void;
}>();

runtime.events.selected((event, lsn) => {
	expectTypeOf(lsn).toEqualTypeOf<string>();
	if (event.op === 'insert') expectTypeOf(event.row).toEqualTypeOf<IdStatusRow>();
	if (event.op === 'update') {
		expectTypeOf(event.row).toEqualTypeOf<IdStatusRow>();
		expectTypeOf(event.oldRow).toEqualTypeOf<IdStatusRow>();
	}
	if (event.op === 'delete') expectTypeOf(event.oldRow).toEqualTypeOf<IdStatusRow>();
}, { onResync: () => {}, onError: (error) => expectTypeOf(error).toEqualTypeOf<Error>() });

// @ts-expect-error the callback is required
runtime.events.selected();
// @ts-expect-error a query with args needs them before the callback
runtime.events.withArgs(() => {});
// @ts-expect-error CDC event streams take no auth option
runtime.events.selected(() => {}, { auth: { userId: 1 } });

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

expectTypeOf<PulseInsertEvent<IdStatusRow>>().toEqualTypeOf<{ op: 'insert'; row: IdStatusRow; pk: unknown }>();
expectTypeOf<PulseUpdateEvent<IdStatusRow>>().toEqualTypeOf<
	{ op: 'update'; row: IdStatusRow; oldRow: IdStatusRow; pk: unknown }
>();
expectTypeOf<PulseDeleteEvent<IdStatusRow>>().toEqualTypeOf<{ op: 'delete'; oldRow: IdStatusRow; pk: unknown }>();
expectTypeOf<PulseEvent<IdStatusRow>>().toEqualTypeOf<
	PulseInsertEvent<IdStatusRow> | PulseUpdateEvent<IdStatusRow> | PulseDeleteEvent<IdStatusRow>
>();

// ---------------------------------------------------------------------------
// Runtime configuration types
// ---------------------------------------------------------------------------

expectTypeOf<TelemetryEvent>().toEqualTypeOf<{
	schema: string;
	table: string;
	op: 'insert' | 'update' | 'delete' | 'rebaseline';
	rowCount: number;
	committedAtMicros: number;
	appliedAtMicros: number;
	commitLsn: string;
}>();
expectTypeOf<PulseRuntimeWalConfig>().toEqualTypeOf<{ publicationName?: string; slotName?: string }>();

const logLevelValues: [0, 1, 2, 3] = [LogLevel.Silent, LogLevel.Error, LogLevel.Info, LogLevel.Debug];
void logLevelValues;

// Every pg driver's drizzle instance is accepted as the source database.
expectTypeOf<ReturnType<typeof drizzlePostgresJs>>().toMatchTypeOf<PulseSourceDb>();
expectTypeOf<ReturnType<typeof drizzleNodePg>>().toMatchTypeOf<PulseSourceDb>();
expectTypeOf<ReturnType<typeof drizzlePostgres>>().toMatchTypeOf<PulseSourceDb>();

// ---------------------------------------------------------------------------
// Query builder types
// ---------------------------------------------------------------------------

expectTypeOf<EmbeddedPulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, Record<never, never>>>()
	.toEqualTypeOf<PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, Record<never, never>>>();
expectTypeOf(queries).toMatchTypeOf<AnyPulseBuilders>();
// @ts-expect-error a plain object is not a query builder
const notQueries: AnyPulseBuilders = { q: { table: orders } };
void notQueries;
