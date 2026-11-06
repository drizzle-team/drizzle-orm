import { decimal, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-orm/zod';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
});

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    driverId: integer('driver_id').references(() => users.id, { onDelete: 'cascade' }),
    pickup: text('pickup').notNull(),
    dropoff: text('dropoff').notNull(),
    price: decimal('price', { mode: 'number' }).notNull(),
    status: text('status', { enum: ['requested', 'accepted', 'completed', 'cancelled'] })
      .notNull()
      .default('requested'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_orders_driver_id').on(table.driverId),
    index('idx_orders_status').on(table.status),
  ],
);

const orderSchema = createSelectSchema(orders);
export const ordersByStatusArgsSchema = orderSchema.pick({ status: true });
