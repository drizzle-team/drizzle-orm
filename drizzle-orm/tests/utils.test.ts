import { describe, expect, test } from 'vitest';
import { sqliteTable, text } from '~/sqlite-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const branding = sqliteTable('branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const owner = sqliteTable('owner', {
	name: text('name'),
});

const brandingFields = orderSelectedFields({
	branding: {
		logo: branding.logo,
		panelBackground: branding.panelBackground,
	},
});

describe('mapResultRow', () => {
	test('keeps a joined object when a later selected column is non-null', () => {
		const result = mapResultRow(
			brandingFields,
			[null, '#1a8cff'],
			{ branding: false },
		);

		expect(result).toEqual({
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('keeps the joined object when a later selected column is null', () => {
		const fields = orderSelectedFields({
			branding: {
				panelBackground: branding.panelBackground,
				logo: branding.logo,
			},
		});

		const result = mapResultRow(
			fields,
			['#1a8cff', null],
			{ branding: false },
		);

		expect(result).toEqual({
			branding: {
				panelBackground: '#1a8cff',
				logo: null,
			},
		});
	});

	test('nullifies a nullable joined object when every selected column is null', () => {
		const result = mapResultRow(brandingFields, [null, null], { branding: false });

		expect(result).toEqual({ branding: null });
	});

	test('preserves all-null columns for a non-nullable joined object', () => {
		const result = mapResultRow(brandingFields, [null, null], { branding: true });

		expect(result).toEqual({
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});

	test('does not nullify a nested object whose fields come from multiple tables', () => {
		const fields = orderSelectedFields({
			branding: {
				logo: branding.logo,
				ownerName: owner.name,
			},
		});

		const result = mapResultRow(fields, [null, null], {
			branding: false,
			owner: false,
		});

		expect(result).toEqual({
			branding: {
				logo: null,
				ownerName: null,
			},
		});
	});
});
