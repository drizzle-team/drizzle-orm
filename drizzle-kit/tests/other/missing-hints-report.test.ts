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

	test('single confirm_data_loss with reason `non_empty` emits no rename alternative', () => {
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
		expect(stripped).toMatch(/1\. Confirm data loss\s+—\s+table\s+public\.legacy_audit\s+\(reason: non_empty\)/);
		expect(stripped).toContain(`{ "type": "confirm_data_loss", "kind": "table", "entity": ["public", "legacy_audit"] }`);
		// No rename alternative is rendered for confirm_data_loss
		expect(stripped).not.toContain('"type": "rename"');
		expect(stripped).not.toMatch(/^\s+OR\s*$/m);
	});

	test('confirm_data_loss with reason `type_change` renders the reason discriminator in the header', () => {
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

		expect(stripped).toMatch(/1\. Confirm data loss\s+—\s+column\s+public\.users\.age\s+\(reason: type_change\)/);
		expect(stripped).toContain('type_change');
		expect(stripped).toContain(
			`{ "type": "confirm_data_loss", "kind": "column", "entity": ["public", "users", "age"] }`,
		);
	});

	test('input order [confirm_data_loss, rename_or_create] still renders rename_or_create as item 1 per D-03 partitioning', () => {
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

	test('blank-line spacing separates header from items, items from each other, and items from footer', () => {
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

		// Header followed by a blank line then item 1
		expect(stripped).toMatch(/missing_hints: 2 unresolved decisions\n\n1\. Rename or create/);
		// Blank line between consecutive items
		expect(stripped).toMatch(/}\n\n2\. Confirm data loss/);
		// Blank line before the footer
		expect(stripped).toMatch(/}\n\nRe-run with --hints/);
	});

	test('header and footer literals match the locked phrasing exactly', () => {
		const out = formatMissingHintsText(
			responseOf({ type: 'rename_or_create', kind: 'table', entity: ['public', 'users_v2'] }),
		);
		const stripped = strip(out);

		expect(stripped).toContain('missing_hints: 1 unresolved decisions');
		expect(stripped).toContain(`Re-run with --hints '<json-array>'. Exit code 2.`);
	});
});
