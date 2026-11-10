import { decimal, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-orm/zod';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  driverId: integer('driver_id'),
  status: text('status', { enum: ['requested', 'accepted', 'completed', 'cancelled'] })
    .notNull()
    .default('requested'),
  price: decimal('price', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const orderSchema = createSelectSchema(orders);
export const ordersByStatusArgsSchema = orderSchema.pick({ status: true });
