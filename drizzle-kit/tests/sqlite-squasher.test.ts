import { expect, test } from 'vitest';
import { SQLiteSquasher } from 'src/serializer/sqliteSchema';

test('squashIdx JSON-encodes columns so expression commas survive the round-trip', () => {
	const squashed = SQLiteSquasher.squashIdx({
		name: 'expr_idx',
		columns: ["json_extract(payload, '$.ref')", 'id'],
		isUnique: false,
	});

	expect(squashed).toBe(`expr_idx;["json_extract(payload, '$.ref')","id"];false;`);

	const restored = SQLiteSquasher.unsquashIdx(squashed);
	expect(restored.name).toBe('expr_idx');
	expect(restored.columns).toEqual(["json_extract(payload, '$.ref')", 'id']);
	expect(restored.isUnique).toBe(false);
});

test('unsquashIdx reads old-format comma-joined columns (backward compat)', () => {
	const restored = SQLiteSquasher.unsquashIdx('legacy_idx;col_a,col_b;true;');
	expect(restored.name).toBe('legacy_idx');
	expect(restored.columns).toEqual(['col_a', 'col_b']);
	expect(restored.isUnique).toBe(true);
});

test('unsquashIdx falls back to split when an old-format column is valid JSON but not an array', () => {
	// A single column named "123" is valid JSON (number) but not an array.
	const restored = SQLiteSquasher.unsquashIdx('num_idx;123;false;');
	expect(restored.columns).toEqual(['123']);
});

test('unsquashUnique JSON-encodes expression columns and round-trips them', () => {
	const squashed = SQLiteSquasher.squashUnique({
		name: 'expr_unq',
		columns: ["json_extract(payload, '$.ref')", 'id'],
	});
	expect(squashed).toBe(`expr_unq;["json_extract(payload, '$.ref')","id"]`);

	const restored = SQLiteSquasher.unsquashUnique(squashed);
	expect(restored.name).toBe('expr_unq');
	expect(restored.columns).toEqual(["json_extract(payload, '$.ref')", 'id']);
});

test('unsquashUnique falls back to split when an old-format column is valid JSON but not an array', () => {
	// A single column named "true" is valid JSON (boolean) but not an array.
	const restored = SQLiteSquasher.unsquashUnique('bool_unq;true');
	expect(restored.name).toBe('bool_unq');
	expect(restored.columns).toEqual(['true']);
});

test('unsquashUnique reads old-format comma-joined columns (backward compat)', () => {
	const restored = SQLiteSquasher.unsquashUnique('legacy_unq;col_a,col_b');
	expect(restored.columns).toEqual(['col_a', 'col_b']);
});
