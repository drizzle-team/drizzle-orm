import { stripAnsi } from 'hanji/utils';
import type { MissingHint, MissingHintsResponse } from 'src/cli/hints';
import { formatMissingHintsText } from 'src/cli/missing-hints-report';
import { describe, expect, test } from 'vitest';

const strip = (s: string) => stripAnsi(s);

const responseOf = (...unresolved: MissingHint[]): MissingHintsResponse => ({
	status: 'missing_hints',
	unresolved,
});

describe('formatMissingHintsText', () => {
	test('empty unresolved array — header reads `missing_hints: 0 unresolved decisions` and footer is present', () => {
		const out = formatMissingHintsText(responseOf());
		const stripped = strip(out);

		expect(stripped).toContain('missing_hints: 0 unresolved decisions');
		expect(stripped).toContain(`Re-run with --hints '<json-array>'. Exit code 2.`);
		// No item lines at all
		expect(stripped).not.toMatch(/^\s*1\./m);
	});

	test('single rename_or_create with a 2-tuple table entity emits the locked layout', () => {
		const out = formatMissingHintsText(
			responseOf({ type: 'rename_or_create', kind: 'table', entity: ['public', 'users_v2'] }),
		);
		const stripped = strip(out);

		expect(stripped).toContain('missing_hints: 1 unresolved decisions');
		expect(stripped).toMatch(/1\. Rename or create\s+—\s+table\s+public\.users_v2/);
		expect(stripped).toContain('Add to --hints:');
		expect(stripped).toContain(
			`{ "type": "rename", "kind": "table", "from": ["<schema>", "<old_name>"], "to": ["public", "users_v2"] }`,
		);
		expect(stripped).toContain('OR');
		expect(stripped).toContain(`{ "type": "create", "kind": "table", "entity": ["public", "users_v2"] }`);
		expect(stripped).toContain(`Re-run with --hints '<json-array>'. Exit code 2.`);
	});

	test('single rename_or_create with a 1-tuple schema entity uses a 1-segment `from` placeholder', () => {
		const out = formatMissingHintsText(
			responseOf({ type: 'rename_or_create', kind: 'schema', entity: ['marketing'] }),
		);
		const stripped = strip(out);

		expect(stripped).toMatch(/1\. Rename or create\s+—\s+schema\s+marketing/);
		expect(stripped).toContain(`"from": ["<old_name>"]`);
		expect(stripped).toContain(`"to": ["marketing"]`);
		expect(stripped).toContain(`{ "type": "create", "kind": "schema", "entity": ["marketing"] }`);
	});

	test('single rename_or_create with a 3-tuple column entity uses a 3-segment `from` placeholder', () => {
		const out = formatMissingHintsText(
			responseOf({ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email_v2'] }),
		);
		const stripped = strip(out);

		expect(stripped).toMatch(/1\. Rename or create\s+—\s+column\s+public\.users\.email_v2/);
		expect(stripped).toContain(`"from": ["<schema>", "<table>", "<old_name>"]`);
		expect(stripped).toContain(`"to": ["public", "users", "email_v2"]`);
	});

	test('confirm_data_loss with reason `non_empty` conveys the entity and a human non-empty reason, no rename alternative', () => {
		const out = formatMissingHintsText(
			responseOf({
				type: 'confirm_data_loss',
				kind: 'table',
				entity: ['public', 'legacy_audit'],
				reason: 'non_empty',
			}),
		);
		const stripped = strip(out);

		expect(stripped).toContain('missing_hints: 1 unresolved decisions');
		expect(stripped).toMatch(/1\. Confirm data loss\s+—\s+table\s+public\.legacy_audit/);
		expect(stripped).toContain('public.legacy_audit');
		expect(stripped).toMatch(/non-empty table/);
		expect(stripped).toContain(
			`{ "type": "confirm_data_loss", "kind": "table", "entity": ["public", "legacy_audit"] }`,
		);
		// No rename alternative is rendered for confirm_data_loss
		expect(stripped).not.toContain('"type": "rename"');
		expect(stripped).not.toMatch(/^\s+OR\s*$/m);
	});

	test('confirm_data_loss with reason `table_recreate` conveys the entity and a human table-recreate reason', () => {
		const out = formatMissingHintsText(
			responseOf({
				type: 'confirm_data_loss',
				kind: 'add_not_null',
				entity: ['public', 'users', 'status'],
				reason: 'table_recreate',
			}),
		);
		const stripped = strip(out);

		expect(stripped).toMatch(/1\. Confirm data loss\s+—\s+add not null\s+public\.users\.status/);
		expect(stripped).toContain('public.users.status');
		expect(stripped).toMatch(/wipes all rows and recreates the table/i);
		expect(stripped).toContain(
			`{ "type": "confirm_data_loss", "kind": "add_not_null", "entity": ["public", "users", "status"] }`,
		);
	});

	test('confirm_data_loss with reason `type_change` conveys the entity and the from/to types', () => {
		const out = formatMissingHintsText(
			responseOf({
				type: 'confirm_data_loss',
				kind: 'column',
				entity: ['public', 'users', 'age'],
				reason: 'type_change',
				reason_details: { from: 'int', to: 'text' },
			}),
		);
		const stripped = strip(out);

		expect(stripped).toMatch(/1\. Confirm data loss\s+—\s+column\s+public\.users\.age/);
		expect(stripped).toContain('public.users.age');
		expect(stripped).toContain('int');
		expect(stripped).toContain('text');
		expect(stripped).toContain(
			`{ "type": "confirm_data_loss", "kind": "column", "entity": ["public", "users", "age"] }`,
		);
	});

	test('input order [confirm_data_loss, rename_or_create] still renders rename_or_create as item 1', () => {
		const out = formatMissingHintsText(
			responseOf(
				{
					type: 'confirm_data_loss',
					kind: 'table',
					entity: ['public', 'legacy_audit'],
					reason: 'non_empty',
				},
				{ type: 'rename_or_create', kind: 'table', entity: ['public', 'users_v2'] },
			),
		);
		const stripped = strip(out);

		expect(stripped).toContain('missing_hints: 2 unresolved decisions');
		const renameIdx = stripped.indexOf('1. Rename or create');
		const confirmIdx = stripped.indexOf('2. Confirm data loss');
		expect(renameIdx).toBeGreaterThan(-1);
		expect(confirmIdx).toBeGreaterThan(renameIdx);
	});

	test('multiple rename_or_create entries preserve discovery order within the partition', () => {
		const out = formatMissingHintsText(
			responseOf(
				{ type: 'rename_or_create', kind: 'table', entity: ['public', 'users_v2'] },
				{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders_v2'] },
			),
		);
		const stripped = strip(out);

		const firstIdx = stripped.indexOf('public.users_v2');
		const secondIdx = stripped.indexOf('public.orders_v2');
		expect(firstIdx).toBeGreaterThan(-1);
		expect(secondIdx).toBeGreaterThan(firstIdx);
		expect(stripped).toMatch(/1\. Rename or create\s+—\s+table\s+public\.users_v2/);
		expect(stripped).toMatch(/2\. Rename or create\s+—\s+table\s+public\.orders_v2/);
	});

	test('report renders header, then items in order, then footer', () => {
		const out = formatMissingHintsText(
			responseOf(
				{ type: 'rename_or_create', kind: 'table', entity: ['public', 'users_v2'] },
				{
					type: 'confirm_data_loss',
					kind: 'table',
					entity: ['public', 'legacy_audit'],
					reason: 'non_empty',
				},
			),
		);
		const stripped = strip(out);

		const headerIdx = stripped.indexOf('missing_hints: 2 unresolved decisions');
		const item1Idx = stripped.indexOf('1. Rename or create');
		const item2Idx = stripped.indexOf('2. Confirm data loss');
		const footerIdx = stripped.indexOf('Re-run with --hints');

		expect(headerIdx).toBeGreaterThan(-1);
		expect(item1Idx).toBeGreaterThan(headerIdx);
		expect(item2Idx).toBeGreaterThan(item1Idx);
		expect(footerIdx).toBeGreaterThan(item2Idx);
	});
});
