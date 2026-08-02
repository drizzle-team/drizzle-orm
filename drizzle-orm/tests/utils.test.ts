import { describe, expect, test } from 'vitest';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';
import { sqliteTable, text } from '~/sqlite-core/index.ts';

const branding = sqliteTable('branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const owner = sqliteTable('owner', {
	name: text('name'),
});

const selectedFields = orderSelectedFields({
	branding: {
		logo: branding.logo,
		panelBackground: branding.panelBackground,
	},
});

describe('mapResultRow', () => {
	test('keeps a nullable joined object when a later column has a value', () => {
		const result = mapResultRow(
			selectedFields,
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

	test('nullifies a nullable joined object when every column is null', () => {
		const result = mapResultRow(selectedFields, [null, null], { branding: false });

		expect(result).toEqual({ branding: null });
	});

	test('keeps a nullable joined object when an earlier column has a value', () => {
		const result = mapResultRow(
			orderSelectedFields({
				branding: {
					panelBackground: branding.panelBackground,
					logo: branding.logo,
				},
			}),
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

	test('preserves all-null fields for a non-nullable joined object', () => {
		const result = mapResultRow(selectedFields, [null, null], { branding: true });

		expect(result).toEqual({
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});

	test('does not nullify a nested object assembled from multiple tables', () => {
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
