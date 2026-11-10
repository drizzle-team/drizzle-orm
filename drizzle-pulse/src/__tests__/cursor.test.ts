import { describe, expect, test } from 'bun:test';
import { formatCursor, parseCursor } from '../server/cursor.js';

describe('cursor codec', () => {
  test('round-trips epoch + snapshot', () => {
    const epoch = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(parseCursor(formatCursor(epoch, 0))).toEqual({ epoch, snapshot: 0 });
    expect(parseCursor(formatCursor(epoch, 42))).toEqual({ epoch, snapshot: 42 });
  });

  test('splits on the first colon only (uuids never contain one, snapshot is digits)', () => {
    expect(formatCursor('epoch', 7)).toBe('epoch:7');
    expect(parseCursor('a:b:c')).toBeNull();
  });

  test('rejects malformed tokens', () => {
    expect(parseCursor('')).toBeNull();
    expect(parseCursor(':5')).toBeNull();
    expect(parseCursor('epoch')).toBeNull();
    expect(parseCursor('epoch:')).toBeNull();
    expect(parseCursor('epoch:-1')).toBeNull();
    expect(parseCursor('epoch:1.5')).toBeNull();
    expect(parseCursor('epoch:abc')).toBeNull();
  });
});
