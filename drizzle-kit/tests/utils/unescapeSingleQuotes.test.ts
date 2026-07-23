import { describe, expect, test } from 'vitest';
import { unescapeSingleQuotes } from '../../src/utils';

describe('unescapeSingleQuotes', () => {
  test("returns empty string for SQL literal '' when ignoring first/last", () => {
    // Before the fix, this incorrectly returned "'"
    const input = "''";
    const out = unescapeSingleQuotes(input, true);
    expect(out).toBe('');
  });

  test("keeps non-empty strings intact (ignoring first/last)", () => {
    const input = "'queued'";
    const out = unescapeSingleQuotes(input, true);
    expect(out).toBe("'queued'");
  });

  test("escapes internal single quotes when not ignoring first/last", () => {
    const input = "it''s"; // SQL escaped: it''s
    const out = unescapeSingleQuotes(input, false);
    expect(out).toBe("it's");
  });
});
