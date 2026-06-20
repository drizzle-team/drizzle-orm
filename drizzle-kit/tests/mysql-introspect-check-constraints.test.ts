/**
 * Regression coverage for issue #5921.
 *
 * `drizzle-kit pull` against MySQL 5.7 used to exit `1` with no surfaced
 * error because the introspection query against
 * `information_schema.check_constraints` (which 5.7 does not have) blew
 * up the entire `fromDatabase` call. The fix downgrades exactly that
 * failure to "no check constraints" while keeping every other error
 * (auth, connectivity, unrelated SQL) propagating.
 */
import { expect, test } from 'vitest';
import { isMissingCheckConstraintsView } from '../src/serializer/mysqlSerializer';

test('isMissingCheckConstraintsView: ER_NO_SUCH_TABLE on check_constraints (mysql2 shape)', () => {
	const err = Object.assign(new Error("Unknown table 'check_constraints' in information_schema"), {
		code: 'ER_NO_SUCH_TABLE',
		errno: 1109,
	});
	expect(isMissingCheckConstraintsView(err)).toBe(true);
});

test('isMissingCheckConstraintsView: MariaDB-style message-only match', () => {
	// Some drivers do not populate `code`; we still want to recognize the
	// failure mode from the message alone.
	const err = new Error("Unknown table 'check_constraints' in information_schema");
	expect(isMissingCheckConstraintsView(err)).toBe(true);
});

test("isMissingCheckConstraintsView: 'doesn't exist' phrasing", () => {
	const err = new Error("Table 'information_schema.check_constraints' doesn't exist");
	expect(isMissingCheckConstraintsView(err)).toBe(true);
});

test('isMissingCheckConstraintsView: rejects unrelated SQL error', () => {
	const err = Object.assign(new Error('Access denied for user'), {
		code: 'ER_ACCESS_DENIED_ERROR',
	});
	expect(isMissingCheckConstraintsView(err)).toBe(false);
});

test('isMissingCheckConstraintsView: rejects ER_NO_SUCH_TABLE on a different table', () => {
	// A real "table not found" on a user table must NOT be swallowed by
	// the check-constraints guard.
	const err = Object.assign(new Error("Unknown table 'foo_bar' in test_schema"), {
		code: 'ER_NO_SUCH_TABLE',
	});
	expect(isMissingCheckConstraintsView(err)).toBe(false);
});

test('isMissingCheckConstraintsView: rejects null / undefined / non-object', () => {
	expect(isMissingCheckConstraintsView(null)).toBe(false);
	expect(isMissingCheckConstraintsView(undefined)).toBe(false);
	expect(isMissingCheckConstraintsView('check_constraints')).toBe(false);
	expect(isMissingCheckConstraintsView(42)).toBe(false);
});

test('isMissingCheckConstraintsView: rejects a check_constraints mention without missing-table phrasing', () => {
	// A SELECT permission error on the check_constraints view should NOT
	// be downgraded to "no check constraints"; the operator needs to see it.
	const err = Object.assign(
		new Error("SELECT command denied to user for table 'check_constraints'"),
		{ code: 'ER_TABLEACCESS_DENIED_ERROR' },
	);
	expect(isMissingCheckConstraintsView(err)).toBe(false);
});
