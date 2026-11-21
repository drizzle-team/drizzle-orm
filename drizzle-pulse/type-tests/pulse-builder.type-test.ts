import { expectTypeOf } from 'bun:test';
import { z } from 'zod';
import { pulse, type PulseBuilder } from '../src/index.js';
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
	PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, Record<never, never>, OrderRow>
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
		{ status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
		OrderRow
	>
>();
expectTypeOf(replacedArgsQuery).toEqualTypeOf<
	PulseBuilder<typeof orders, Record<never, boolean>, { driverId: number }, { driverId: number }, OrderRow>
>();

expectTypeOf(transformedQuery).toEqualTypeOf<
	PulseBuilder<
		typeof orders,
		Record<never, boolean>,
		Record<never, never>,
		Record<never, never>,
		OrderRow,
		{ transformed: true; limited: false }
	>
>();

// Callers pass the schema input type, and the where-function reads the output type.
const defaultedArgsQuery = pulse(orders)
	.args(z.object({ status: z.string().default('accepted'), limit: z.string().transform(Number) }))
	.query((ctx) => {
		expectTypeOf(ctx.args).toEqualTypeOf<{ status: string; limit: number }>();
		return null;
	});
expectTypeOf(defaultedArgsQuery._.argsInput).toEqualTypeOf<{ status?: string | undefined; limit: string }>();
const defaultedArgsRegistry = createPulseRegistry({ defaultedArgsQuery });
expectTypeOf(defaultedArgsRegistry.$client.defaultedArgsQuery).parameter(0).toEqualTypeOf<
	{ status?: string | undefined; limit: string }
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
	PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, Record<never, never>, OrderRow>
>();
expectTypeOf(statusArgsQuery).toEqualTypeOf<
	PulseBuilder<
		typeof orders,
		Record<never, boolean>,
		{ status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
		{ status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
		OrderRow
	>
>();
expectTypeOf(noArgsQuery).toEqualTypeOf<
	PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, Record<never, never>, OrderRow>
>();

// Any Standard Schema works, not only zod. This object implements the spec by hand.
const handWrittenSchema = {
	'~standard': {
		version: 1 as const,
		vendor: 'hand-written',
		validate: (value: unknown) => ({ value: { driverId: Number((value as { driverId: string }).driverId) } }),
		types: undefined as unknown as { input: { driverId: string }; output: { driverId: number } },
	},
};
const handWrittenArgsQuery = pulse(orders)
	.args(handWrittenSchema)
	.query((ctx) => {
		expectTypeOf(ctx.args).toEqualTypeOf<{ driverId: number }>();
		return ctx.query({ driverId: ctx.args.driverId });
	});
expectTypeOf(handWrittenArgsQuery._.argsInput).toEqualTypeOf<{ driverId: string }>();
const handWrittenRegistry = createPulseRegistry({ handWrittenArgsQuery });
expectTypeOf(handWrittenRegistry.$client.handWrittenArgsQuery).parameter(0).toEqualTypeOf<{ driverId: string }>();
// @ts-expect-error a value without `~standard` is not a schema
pulse(orders).args({ parse: (value: unknown) => value });
