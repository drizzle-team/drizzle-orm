import { expectTypeOf } from 'bun:test';
import {
	type ColumnOperators,
	pulse,
	type PulseAuthContext,
	type PulseQueryContext,
	type WhereClause,
	type WhereCondition,
} from '../src/index.js';
import { orders } from './fixtures.js';

type Status = 'requested' | 'accepted' | 'completed' | 'cancelled';
type Row = { id: number; status: Status; driverId: number | null };

expectTypeOf<ColumnOperators<number>>().toEqualTypeOf<{
	eq?: number;
	ne?: number;
	gt?: number;
	gte?: number;
	lt?: number;
	lte?: number;
	in?: readonly number[];
	isNull?: true;
	isNotNull?: true;
}>();

// `in` accepts a readonly tuple.
const statuses = ['accepted', 'completed'] as const;
const inCondition: WhereCondition<Row> = { status: { in: statuses } };
void inCondition;

const nested: WhereCondition<Row> = {
	OR: [{ id: 1 }, { AND: [{ driverId: { isNull: true } }, { NOT: { status: 'cancelled' } }] }],
};
void nested;
// @ts-expect-error unknown column
const unknownColumn: WhereCondition<Row> = { price: 1 };
void unknownColumn;
// @ts-expect-error AND cannot be mixed with column filters
const mixed: WhereCondition<Row> = { id: 1, AND: [] };
void mixed;

expectTypeOf<PulseAuthContext>().toEqualTypeOf<{ userId: number | null }>();

expectTypeOf<PulseQueryContext<{ status: Status }, Row>>().toEqualTypeOf<{
	query: (where: WhereCondition<Row>) => WhereClause;
	args: { status: Status };
	auth: PulseAuthContext;
}>();

// A where-function helper can be written against the exported context type.
function byStatus(ctx: PulseQueryContext<Record<never, never>, typeof orders.$inferSelect>): WhereClause {
	return ctx.query({ status: 'accepted' });
}
pulse(orders).query(byStatus);
