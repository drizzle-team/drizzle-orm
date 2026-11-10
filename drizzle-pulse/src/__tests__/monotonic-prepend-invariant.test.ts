import { describe, expect, test } from 'bun:test';
import { isInsertPrepend } from '../shared/pk-utils.js';

describe('monotonic prepend boundary invariant', () => {
  test('desc: stale range end still admits monotonic prepend insert', () => {
    expect(isInsertPrepend('desc', 128, 123, 127)).toBe(true);
  });

  test('desc: append-side insert is rejected', () => {
    expect(isInsertPrepend('desc', 120, 123, 127)).toBe(false);
  });

  test('asc: stale range start still admits monotonic prepend insert', () => {
    expect(isInsertPrepend('asc', 3, 5, 20)).toBe(true);
  });

  test('asc: append-side insert is rejected', () => {
    expect(isInsertPrepend('asc', 25, 5, 20)).toBe(false);
  });
});
