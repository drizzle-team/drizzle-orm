import { expectTypeOf } from 'bun:test';
import { pulse, type PulseAuthContext, type PulseBuilder, PulseTable } from '../src/index.js';
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

// A where-function set on the Pulse table has no arguments: `ctx.args` is empty.
const tableLevelQuery = pulse(orders).query(({ query, args, auth }) => {
	expectTypeOf(args).toEqualTypeOf<Record<never, never>>();
	expectTypeOf(auth).toEqualTypeOf<PulseAuthContext>();
	// @ts-expect-error args has no fields without a schema
	void args.status;
	return query({ status: 'accepted' });
});
expectTypeOf(tableLevelQuery).toEqualTypeOf<
	PulseBuilder<typeof orders, Record<never, boolean>, Record<never, never>, Record<never, never>, OrderRow>
>();

// `.args()` before `.query(fn)` gives the where-function typed arguments.
const argsFirst = pulse(orders)
	.args(statusSchema)
	.order('desc')
	.query((ctx) => {
		expectTypeOf(ctx.args.status).toEqualTypeOf<
			'requested' | 'accepted' | 'completed' | 'cancelled'
		>();
		return ctx.query({ status: ctx.args.status });
	});
expectTypeOf(argsFirst).toEqualTypeOf<
	PulseBuilder<
		typeof orders,
		Record<never, boolean>,
		{ status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
		{ status: 'requested' | 'accepted' | 'completed' | 'cancelled' },
		OrderRow
	>
>();

// `.args()` after `.query(fn)` still compiles, but it throws at runtime.
expectTypeOf(pulse(orders).query(() => null).args).toBeFunction();

// The shortcut methods on the Pulse table start the same chain as `.query()`.
expectTypeOf(pulse(orders)).toEqualTypeOf<PulseTable<typeof orders>>();
expectTypeOf(pulse(orders).columns({ id: true })._.result).toEqualTypeOf<{ id: number }>();
expectTypeOf(pulse(orders).order('asc')).toEqualTypeOf<typeof bareQueryForShortcuts>();
expectTypeOf(pulse(orders).limit(1)).toEqualTypeOf<
	PulseBuilder<
		typeof orders,
		Record<never, boolean>,
		Record<never, never>,
		Record<never, never>,
		OrderRow,
		{ transformed: false; limited: true }
	>
>();
expectTypeOf(pulse(orders).transform((rows) => rows.map((row) => ({ id: row.id })))).toEqualTypeOf<
	PulseBuilder<
		typeof orders,
		Record<never, boolean>,
		Record<never, never>,
		Record<never, never>,
		{ id: number },
		{ transformed: true; limited: false }
	>
>();
declare const bareQueryForShortcuts: PulseBuilder<
	typeof orders,
	Record<never, boolean>,
	Record<never, never>,
	Record<never, never>,
	OrderRow
>;

// Bare `pulse(orders).query()` compiles and is assignable where a PulseBuilder is expected.
const bareQuery = pulse(orders).query();
const asBuilder: PulseBuilder<
	typeof orders,
	Record<never, boolean>,
	Record<never, never>,
	Record<never, never>,
	OrderRow
> = bareQuery;
void asBuilder;

// @ts-expect-error pulse(table) takes exactly one argument
pulse(orders, {});
