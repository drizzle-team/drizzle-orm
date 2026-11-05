import { describe, expect, test } from 'bun:test';
import { getColumns } from 'drizzle-orm';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { extractRow } from '../shared/event-normalization.js';

// Fixture: SQL column names differ from query keys (driverId → driver_id in SQL). The event
// records extractRow reads are already JS-property-keyed, so they use `driverId`, not
// `driver_id` — extractRow selects and prunes by query key, it no longer re-maps SQL names.
const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),
  price: integer('price'),
  driverId: integer('driver_id'),
});

const columns = getColumns(ordersTable);

describe('extractRow', () => {
  test('selects query-keyed columns from a JS-keyed event record', () => {
    const rawEvent: Record<string, unknown> = {
      id: 1,
      status: 'accepted',
      price: 100,
      driverId: 42,
    };

    const result = extractRow(rawEvent, columns);

    expect(result).toEqual({
      id: 1,
      status: 'accepted',
      price: 100,
      driverId: 42,
    });
  });

  test('$old_ prefix pulls $old_<queryKey> values', () => {
    const rawEvent: Record<string, unknown> = {
      // current row values
      id: 2,
      status: 'completed',
      price: 200,
      driverId: 7,
      // old row values with $old_ prefix on the JS property key
      $old_id: 2,
      $old_status: 'accepted',
      $old_price: 150,
      $old_driverId: 7,
    };

    const result = extractRow(rawEvent, columns, '$old_');

    expect(result).toEqual({
      id: 2,
      status: 'accepted',
      price: 150,
      driverId: 7,
    });
  });

  test('undefined source values are omitted from the result', () => {
    const rawEvent: Record<string, unknown> = {
      id: 3,
      status: 'requested',
      // price and driver_id absent (undefined)
    };

    const result = extractRow(rawEvent, columns);

    expect(result).toEqual({ id: 3, status: 'requested' });
    expect(result).not.toHaveProperty('price');
    expect(result).not.toHaveProperty('driverId');
  });

  test('all-undefined event yields null', () => {
    const rawEvent: Record<string, unknown> = {};

    const result = extractRow(rawEvent, columns);

    expect(result).toBeNull();
  });

  test('null values are included (only undefined is omitted)', () => {
    const rawEvent: Record<string, unknown> = {
      id: 4,
      status: 'requested',
      price: null,
      driverId: null,
    };

    const result = extractRow(rawEvent, columns);

    expect(result).toEqual({ id: 4, status: 'requested', price: null, driverId: null });
  });
});
