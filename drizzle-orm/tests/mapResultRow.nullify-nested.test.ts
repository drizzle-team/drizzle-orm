import { expect, test } from 'vitest';

import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

test('mapResultRow does not nullify nested objects when at least one nested field is non-null', () => {
	const orgTable = pgTable('org', {
		name: text('name'),
		slug: text('slug'),
	});

	const orgBrandingTable = pgTable('org_branding', {
		logo: text('logo'),
		panelBackground: text('panel_background_colour'),
	});

	const fields = {
		name: orgTable.name,
		slug: orgTable.slug,
		branding: {
			// bug reproduction: first nested value is null, second is not
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	};

	const columns = orderSelectedFields(fields);
	const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];

	const result = mapResultRow<typeof fields>(
		columns,
		row,
		{
			org: true,
			org_branding: false, // left join -> nullable
		},
	);

	expect(result).toEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});
});

