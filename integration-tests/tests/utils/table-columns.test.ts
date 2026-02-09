import { describe, expect, test } from 'vitest';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { getTableColumns, pickTableColumns } from 'drizzle-orm';

describe('table columns utils', () => {
  const users = sqliteTable('users', {
    id: integer('id').primaryKey(),
    name: text('name'),
    email: text('email'),
  });

  test('getTableColumns should return all columns', () => {
    const columns = getTableColumns(users);
    
    expect(Object.keys(columns)).toEqual(['id', 'name', 'email']);
    expect(columns.id.name).toBe('id');
    expect(columns.name.name).toBe('name'); 
    expect(columns.email.name).toBe('email');
  });

  test('pickTableColumns should return only selected columns', () => {
    const columns = pickTableColumns(users, {
      id: true,
      name: true
    });

    expect(Object.keys(columns)).toEqual(['id', 'name']);
    expect(columns.id.name).toBe('id');
    expect(columns.name.name).toBe('name');
    expect(columns.email).toBeUndefined();
  });

  test('pickTableColumns should return empty object if no columns selected', () => {
    const columns = pickTableColumns(users, {});
    expect(Object.keys(columns)).toEqual([]);
  });
});
