import { expectTypeOf } from 'bun:test';
import { pulse } from '../src/index.js';
import type { PulseBuilder } from '../src/server/pulse-builder.js';
import { driverSchema, statusSchema, orders as typeTestOrders } from './fixtures.js';

type TypeTestOrderRow = {
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

type TypeTestOrderStatus = TypeTestOrderRow['status'];

const filteredQuery = pulse(typeTestOrders)
  .query()
  .args(statusSchema)
  .query((ctx) => ctx.query({ status: ctx.args.status }));
const operatorFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    price: { gte: 10, lte: 50 },
    status: { in: ['requested', 'accepted'] },
    acceptedAt: { isNull: true },
  }),
);
const equalityOperatorFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    id: { eq: 42 },
    status: { ne: 'cancelled' },
  }),
);
const boundedOperatorFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    price: { gt: 10, lt: 20 },
    id: { gte: 1, lte: 100 },
  }),
);
const deepLogicalFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    AND: [
      {
        OR: [
          { status: { eq: 'requested' } },
          {
            NOT: {
              AND: [{ acceptedAt: { isNotNull: true } }, { driverId: { isNotNull: true } }],
            },
          },
        ],
      },
      { price: { gte: 1 } },
    ],
  }),
);
const logicalFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    AND: [
      { status: 'requested' },
      { OR: [{ driverId: { isNull: true } }, { driverId: { isNotNull: true } }] },
    ],
  }),
);
const notFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    NOT: {
      OR: [{ status: 'cancelled' }, { acceptedAt: { isNotNull: true } }],
    },
  }),
);
const argsDrivenFilterQuery = pulse(typeTestOrders)
  .query()
  .args(driverSchema)
  .query((ctx) =>
    ctx.query({
      AND: [{ driverId: ctx.args.driverId }, { price: { gt: 0 } }],
    }),
  );
const nullableColumnFilterQuery = pulse(typeTestOrders).query((ctx) =>
  ctx.query({
    OR: [{ driverId: { isNull: true } }, { acceptedAt: { isNull: true } }],
  }),
);

expectTypeOf(filteredQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    { status: TypeTestOrderStatus },
    TypeTestOrderRow
  >
>();
expectTypeOf(operatorFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();
expectTypeOf(equalityOperatorFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();
expectTypeOf(boundedOperatorFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();
expectTypeOf(deepLogicalFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();
expectTypeOf(logicalFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();
expectTypeOf(notFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();
expectTypeOf(argsDrivenFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    { driverId: number },
    TypeTestOrderRow
  >
>();
expectTypeOf(nullableColumnFilterQuery).toEqualTypeOf<
  PulseBuilder<
    typeof typeTestOrders,
    Record<never, boolean>,
    Record<never, never>,
    TypeTestOrderRow
  >
>();

// @ts-expect-error unknown filter column
pulse(typeTestOrders).query((ctx) => ctx.query({ nope: 1 }));
// @ts-expect-error wrong scalar type for numeric column
pulse(typeTestOrders).query((ctx) => ctx.query({ price: 'expensive' }));
// @ts-expect-error wrong operator value type for numeric column
pulse(typeTestOrders).query((ctx) => ctx.query({ price: { gt: 'expensive' } }));
// @ts-expect-error wrong operator value type for nullable date column
pulse(typeTestOrders).query((ctx) => ctx.query({ acceptedAt: { eq: 'yesterday' } }));
// @ts-expect-error wrong in element type for numeric column
pulse(typeTestOrders).query((ctx) => ctx.query({ id: { in: ['1', '2'] } }));
// @ts-expect-error wrong eq type for enum column
pulse(typeTestOrders).query((ctx) => ctx.query({ status: { eq: 'archived' } }));
// @ts-expect-error wrong ne type for nullable numeric column
pulse(typeTestOrders).query((ctx) => ctx.query({ driverId: { ne: 'driver-1' } }));
// @ts-expect-error wrong isNull literal value
pulse(typeTestOrders).query((ctx) => ctx.query({ driverId: { isNull: false } }));
// @ts-expect-error wrong isNotNull literal value
pulse(typeTestOrders).query((ctx) => ctx.query({ acceptedAt: { isNotNull: false } }));
// @ts-expect-error wrong in element type for enum column
pulse(typeTestOrders).query((ctx) => ctx.query({ status: { in: ['requested', 'archived'] } }));
// @ts-expect-error invalid operator key
void pulse(typeTestOrders).query((ctx) => ctx.query({ status: { contains: 'req' } }));
// @ts-expect-error cannot mix logical node with column filters at same level
pulse(typeTestOrders).query((ctx) => ctx.query({ status: 'requested', AND: [{ id: 1 }] }));
// @ts-expect-error cannot use multiple logical operators at same level
pulse(typeTestOrders).query((ctx) => ctx.query({ AND: [{ id: 1 }], OR: [{ id: 2 }] }));
// @ts-expect-error NOT expects an object, not an array
pulse(typeTestOrders).query((ctx) => ctx.query({ NOT: [{ status: 'requested' }] }));
// @ts-expect-error OR expects objects, not scalars
pulse(typeTestOrders).query((ctx) => ctx.query({ OR: ['requested'] }));
// @ts-expect-error AND expects objects, not scalars
pulse(typeTestOrders).query((ctx) => ctx.query({ AND: [1, 2] }));
// @ts-expect-error nullable columns must use isNull instead of raw null
pulse(typeTestOrders).query((ctx) => ctx.query({ driverId: null }));
// @ts-expect-error nullable columns must use isNull instead of raw null
pulse(typeTestOrders).query((ctx) => ctx.query({ acceptedAt: null }));
void pulse(typeTestOrders)
  .query()
  .args(driverSchema)
  // @ts-expect-error args property does not exist on driver args
  .query((ctx) => ctx.query({ driverId: ctx.args.status }));
void pulse(typeTestOrders)
  .query()
  .args(driverSchema)
  // @ts-expect-error args type is wrong for driverId
  .query((ctx) => ctx.query({ driverId: { eq: `${ctx.args.driverId}` } }));
