import { decimal, integer, pgSchema, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';

export const testSchema = pgSchema('test');

export const orders = testSchema.table('orders', {
  id: serial('id').primaryKey(),
  driverId: integer('driver_id'),
  pickup: text('pickup').notNull(),
  dropoff: text('dropoff').notNull(),
  price: decimal('price', { mode: 'number' }).notNull(),
  status: text('status', {
    enum: ['requested', 'accepted', 'completed', 'cancelled'],
  })
    .notNull()
    .default('requested'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const statusSchema = z.object({
  status: z.enum(['requested', 'accepted', 'completed', 'cancelled']),
});
export const driverSchema = z.object({ driverId: z.number() });
