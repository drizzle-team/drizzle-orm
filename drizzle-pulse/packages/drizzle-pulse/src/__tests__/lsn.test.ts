import { describe, expect, test } from 'bun:test';
import { compareLsn, parseLsn } from '../shared/lsn.js';

describe('lsn', () => {
  describe('compareLsn', () => {
    test('does not fall into the lexical-comparison trap', () => {
      // "0/9" > "0/1A2B" lexically, but 0x9 < 0x1A2B numerically.
      expect(compareLsn('0/9', '0/1A2B')).toBe(-1);
    });

    test('returns 0 for equal LSNs', () => {
      expect(compareLsn('1/A2B3', '1/A2B3')).toBe(0);
    });

    test('high-half dominates the low half', () => {
      expect(compareLsn('1/0', '0/FFFFFFFF')).toBe(1);
    });

    test('hex halves are case-insensitive', () => {
      expect(compareLsn('0/1a2b', '0/1A2B')).toBe(0);
    });
  });

  describe('parseLsn', () => {
    test('throws on malformed input (no slash)', () => {
      expect(() => parseLsn('not-an-lsn')).toThrow();
    });

    test('throws on non-hex halves', () => {
      expect(() => parseLsn('0/zzzz')).toThrow();
    });
  });
});
