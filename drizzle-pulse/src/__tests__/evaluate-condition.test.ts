import { describe, expect, test } from 'bun:test';
import { evaluateCondition } from '../shared/filter-ast.js';

const row = { id: 5, status: 'accepted', price: 100, driver_id: 42 };
const rowWithNulls = {
  id: 1,
  status: null as unknown,
  price: null as unknown,
  driver_id: null as unknown,
};

describe('evaluateCondition — SQL parity gate', () => {
  test('null/undefined where → always true', () => {
    expect(evaluateCondition(null, row)).toBe(true);
    expect(evaluateCondition(undefined, row)).toBe(true);
  });

  test('non-object where → always false (matches SQL always-false semantics)', () => {
    expect(evaluateCondition('invalid' as unknown as never, row)).toBe(false);
  });

  test('eq operator', () => {
    expect(evaluateCondition({ id: { eq: 5 } }, row)).toBe(true);
    expect(evaluateCondition({ id: { eq: 6 } }, row)).toBe(false);
    expect(evaluateCondition({ status: { eq: 'accepted' } }, row)).toBe(true);
    expect(evaluateCondition({ status: { eq: 'cancelled' } }, row)).toBe(false);
  });

  test('eq operator — eq: null is always false (SQL: col = NULL → NULL, row excluded)', () => {
    // SQL: col = NULL is always NULL regardless of column value
    expect(evaluateCondition({ status: { eq: null } }, rowWithNulls)).toBe(false);
    expect(evaluateCondition({ status: { eq: null } }, row)).toBe(false);
  });

  test('ne operator — excludes NULLs matching SQL behavior', () => {
    // Column is null → ne returns false (SQL ne excludes NULLs)
    expect(evaluateCondition({ status: { ne: 'cancelled' } }, rowWithNulls)).toBe(false);
    // Column matches → false
    expect(evaluateCondition({ status: { ne: 'accepted' } }, row)).toBe(false);
    // Column differs and is non-null → true
    expect(evaluateCondition({ status: { ne: 'cancelled' } }, row)).toBe(true);
  });

  test('gt/gte/lt/lte operators', () => {
    expect(evaluateCondition({ id: { gt: 4 } }, row)).toBe(true);
    expect(evaluateCondition({ id: { gt: 5 } }, row)).toBe(false);
    expect(evaluateCondition({ id: { gte: 5 } }, row)).toBe(true);
    expect(evaluateCondition({ id: { gte: 6 } }, row)).toBe(false);
    expect(evaluateCondition({ id: { lt: 6 } }, row)).toBe(true);
    expect(evaluateCondition({ id: { lt: 5 } }, row)).toBe(false);
    expect(evaluateCondition({ id: { lte: 5 } }, row)).toBe(true);
    expect(evaluateCondition({ id: { lte: 4 } }, row)).toBe(false);
    // null column → false for all comparison operators (incomparable)
    expect(evaluateCondition({ price: { gt: 0 } }, rowWithNulls)).toBe(false);
    expect(evaluateCondition({ price: { lt: 9999 } }, rowWithNulls)).toBe(false);
  });

  test('in operator — empty is always false', () => {
    expect(evaluateCondition({ status: { in: [] } }, row)).toBe(false);
  });

  test('in operator — non-empty matches element', () => {
    expect(evaluateCondition({ status: { in: ['accepted', 'requested'] } }, row)).toBe(true);
    expect(evaluateCondition({ status: { in: ['cancelled', 'rejected'] } }, row)).toBe(false);
  });

  test('in operator — null column never matches, even when array contains null (SQL parity)', () => {
    // SQL: NULL IN (NULL, 'accepted') → NULL (row excluded)
    expect(evaluateCondition({ status: { in: [null, 'accepted'] } }, rowWithNulls)).toBe(false);
    // SQL: NULL IN ('accepted') → NULL (row excluded)
    expect(evaluateCondition({ status: { in: ['accepted'] } }, rowWithNulls)).toBe(false);
  });

  test('isNull/isNotNull operators', () => {
    expect(evaluateCondition({ price: { isNull: true } }, rowWithNulls)).toBe(true);
    expect(evaluateCondition({ price: { isNull: true } }, row)).toBe(false);
    expect(evaluateCondition({ price: { isNotNull: true } }, row)).toBe(true);
    expect(evaluateCondition({ price: { isNotNull: true } }, rowWithNulls)).toBe(false);
  });

  test('filterValue null → isNull semantics', () => {
    expect(evaluateCondition({ price: null }, rowWithNulls)).toBe(true);
    expect(evaluateCondition({ price: null }, row)).toBe(false);
  });

  test('bare scalar → eq semantics', () => {
    expect(evaluateCondition({ status: 'accepted' }, row)).toBe(true);
    expect(evaluateCondition({ status: 'cancelled' }, row)).toBe(false);
  });

  test('numeric-text coercion matches SQL behavior', () => {
    // '5' equals 5 via compareScalarValues numeric coercion
    expect(evaluateCondition({ id: { eq: '5' } }, row)).toBe(true);
    expect(evaluateCondition({ id: { eq: '6' } }, row)).toBe(false);
  });

  test('AND composition', () => {
    expect(
      evaluateCondition({ AND: [{ id: { gt: 4 } }, { status: { eq: 'accepted' } }] }, row),
    ).toBe(true);
    expect(
      evaluateCondition({ AND: [{ id: { gt: 4 } }, { status: { eq: 'cancelled' } }] }, row),
    ).toBe(false);
  });

  test('OR composition', () => {
    expect(
      evaluateCondition({ OR: [{ status: { eq: 'cancelled' } }, { id: { eq: 5 } }] }, row),
    ).toBe(true);
    expect(
      evaluateCondition({ OR: [{ status: { eq: 'cancelled' } }, { id: { eq: 99 } }] }, row),
    ).toBe(false);
  });

  test('NOT composition', () => {
    expect(evaluateCondition({ NOT: { status: { eq: 'cancelled' } } }, row)).toBe(true);
    expect(evaluateCondition({ NOT: { status: { eq: 'accepted' } } }, row)).toBe(false);
  });

  test('explicit undefined column value — ne and isNull treat undefined as null', () => {
    const rowUndef = { id: 1, status: undefined as unknown, price: null as unknown };
    expect(evaluateCondition({ status: { ne: 'accepted' } }, rowUndef)).toBe(false);
    expect(evaluateCondition({ status: { isNull: true } }, rowUndef)).toBe(true);
    expect(evaluateCondition({ status: { isNotNull: true } }, rowUndef)).toBe(false);
  });

  test('multiple operators on one column — all must hold (AND semantics)', () => {
    // price=100 → gte:50 AND lte:200 → both true
    expect(evaluateCondition({ price: { gte: 50, lte: 200 } }, row)).toBe(true);
    // price=100 → gte:50 AND lte:99 → lte fails
    expect(evaluateCondition({ price: { gte: 50, lte: 99 } }, row)).toBe(false);
  });

  test('deeply nested logical composition', () => {
    const where = {
      AND: [
        {
          OR: [{ status: { eq: 'requested' } }, { id: { eq: 5 } }],
        },
        { price: { gte: 1 } },
      ],
    };
    expect(evaluateCondition(where, row)).toBe(true);
    // row2 fails the OR (status != requested, id != 5)
    const row2 = { id: 10, status: 'cancelled', price: 50, driver_id: null };
    expect(evaluateCondition(where, row2)).toBe(false);
  });
});
