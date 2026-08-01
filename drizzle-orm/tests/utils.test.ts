import { describe, expect, test } from 'vitest';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';
import { sqliteTable, text } from '~/sqlite-core/index.ts';

const branding = sqliteTable('branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
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
});
