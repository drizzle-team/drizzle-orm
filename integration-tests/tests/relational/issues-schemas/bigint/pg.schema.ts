import { relations } from 'drizzle-orm';
import { bigint, bigserial, customType, pgTable } from 'drizzle-orm/pg-core';

export const TestBigint = pgTable('test_bigint', {
	serialBigintId: bigserial({ mode: 'bigint' }).notNull(),
	nonSerialBigint: bigint({ mode: 'bigint' }).notNull(),
});

export const TestBigintChild = pgTable('test_bigint_child', {
	childSerialBigintId: bigserial({ mode: 'bigint' }).notNull(),
	childNonSerialBigint: bigint({ mode: 'bigint' }).notNull(),
	parentBigintId: bigint({ mode: 'bigint' }).notNull(),
});

export const TestBigintRelations = relations(TestBigint, ({ many }) => ({
	children: many(TestBigintChild),
}));

export const TestBigintChildRelations = relations(
	TestBigintChild,
	({ one }) => ({
		parent: one(TestBigint, {
			fields: [TestBigintChild.parentBigintId],
			references: [TestBigint.serialBigintId],
		}),
	}),
);

export const CustomBigint = customType<{
	data: bigint;
	driverData: string;
	default: false;
}>({
	castInRelation: 'text',
	dataType() {
		return 'bigint not null';
	},
	fromDriver(value: string): bigint {
		if (typeof value === 'number') {
			throw new Error(
				`CustomBigint:fromDriver(value: string) received number instead of string, meaning precision was lost.`,
			);
		}
		return BigInt(value);
	},
});

export const CustomBigserial = customType<{
	data: bigint;
	driverData: string;
	default: false;
}>({
	castInRelation: 'text',
	dataType() {
		return 'bigserial not null';
	},
	fromDriver(value: string): bigint {
		if (typeof value === 'number') {
			throw new Error(
				`CustomBigserial:fromDriver(value: string) received number instead of string, meaning precision was lost.`,
			);
		}
		return BigInt(value);
	},
});

export const TestCustomBigint = pgTable('test_custom_bigint', {
	serialBigintId: CustomBigserial().notNull(),
	customBigint: CustomBigint().notNull(),
});

export const TestCustomBigintChild = pgTable('test_custom_bigint_child', {
	childSerialBigintId: CustomBigserial().notNull(),
	childCustomBigint: CustomBigint().notNull(),
	parentBigintId: CustomBigint().notNull(),
});

export const TestCustomBigintRelations = relations(TestCustomBigint, ({ many }) => ({
	children: many(TestCustomBigintChild),
}));

export const TestCustomBigintChildRelations = relations(
	TestCustomBigintChild,
	({ one }) => ({
		parent: one(TestCustomBigint, {
			fields: [TestCustomBigintChild.parentBigintId],
			references: [TestCustomBigint.serialBigintId],
		}),
	}),
);
