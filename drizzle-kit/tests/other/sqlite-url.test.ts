import { expect, test } from 'vitest';
import { normaliseSQLiteUrl } from 'src/utils/utils-node';

// https://github.com/drizzle-team/drizzle-orm/issues/6164
// drizzle-kit detects the user's @tursodatabase/serverless but (before the
// externals fix) runs a bundled older copy that lacks `turso://`
// normalization, so turso:// URLs must be translated by the kit itself.

test('turso:// URLs are normalized to https:// for libsql-family drivers', () => {
	expect(normaliseSQLiteUrl('turso://example-db.turso.io', 'libsql')).toBe(
		'https://example-db.turso.io',
	);
	expect(
		normaliseSQLiteUrl('turso://example-db.turso.io?apiUrl=https://api.turso.io', 'libsql'),
	).toBe('https://example-db.turso.io?apiUrl=https://api.turso.io');
});

test('libsql:// and file: URLs pass through unchanged', () => {
	expect(normaliseSQLiteUrl('libsql://example.turso.io', 'libsql')).toBe(
		'libsql://example.turso.io',
	);
	expect(normaliseSQLiteUrl('file:./local.db', 'libsql')).toBe('file:./local.db');
	expect(normaliseSQLiteUrl('./local.db', 'libsql')).toBe('file:./local.db');
});