import { describe, expect, test } from 'bun:test';
import { getColumns } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { applyColumnFilter } from '../server/pulse-types.js';

const baseRow = { id: 1, name: 'Alice', email: 'alice@example.com', password: 'secret' };
const testTable = pgTable('users', {
  id: integer('id'),
  name: text('name'),
  email: text('email'),
  password: text('password'),
});
const allColumns = getColumns(testTable);

describe('applyColumnFilter', () => {
  test('empty selected columns returns all columns', () => {
    expect(applyColumnFilter(baseRow, {})).toEqual(baseRow);
  });

  test('keeps only resolved selected columns', () => {
    const result = applyColumnFilter(baseRow, {
      name: allColumns.name,
      email: allColumns.email,
    });
    expect(result).toEqual({ name: 'Alice', email: 'alice@example.com' });
    expect('id' in result).toBe(false);
    expect('password' in result).toBe(false);
  });

  test('keeps all resolved selected columns in exclude-style result', () => {
    const result = applyColumnFilter(baseRow, {
      id: allColumns.id,
      name: allColumns.name,
      email: allColumns.email,
    });
    expect(result).toEqual({ id: 1, name: 'Alice', email: 'alice@example.com' });
    expect('password' in result).toBe(false);
  });

  test('drops columns missing from resolved selected columns', () => {
    const result = applyColumnFilter(baseRow, { id: allColumns.id, name: allColumns.name });
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  test('resolved selected columns ignore prior include/exclude builder details', () => {
    const result = applyColumnFilter(baseRow, { name: allColumns.name });
    expect(result).toEqual({ name: 'Alice' });
  });

  test('$pk is always preserved with resolved selected columns', () => {
    const rowWithPk = { ...baseRow, $pk: 42 };
    const result = applyColumnFilter(rowWithPk, { name: allColumns.name });
    expect(result).toEqual({ $pk: 42, name: 'Alice' });
    expect('password' in result).toBe(false);
  });

  test('$pk is always preserved when resolved columns represent an exclude-style selection', () => {
    const rowWithPk = { ...baseRow, $pk: 99 };
    const result = applyColumnFilter(rowWithPk, {
      id: allColumns.id,
      name: allColumns.name,
      email: allColumns.email,
    });
    expect(result).toEqual({ $pk: 99, id: 1, name: 'Alice', email: 'alice@example.com' });
    expect('password' in result).toBe(false);
  });
});
