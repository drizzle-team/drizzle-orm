import { expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const joinedTable = pgTable('joined', {
	nullableField: text('nullable_field'),
	nonNullField: text('non_null_field').notNull(),
});

test('mapResultRow keeps nested object when first joined column is null', () => {
	const fields = {
		joined: {
			nullableField: joinedTable.nullableField,
			nonNullField: joinedTable.nonNullField,
		},
	};

	const columns = orderSelectedFields(fields);

	const result = mapResultRow(
		columns,
		[null, 'value'],
		{
			joined: false,
		},
	);

	expect(result).toEqual({
		joined: {
			nullableField: null,
			nonNullField: 'value',
		},
	});
});

test('mapResultRow nullifies nested object when all joined columns are null', () => {
	const fields = {
		joined: {
			nullableField: joinedTable.nullableField,
			nonNullField: joinedTable.nonNullField,
		},
	};

	const columns = orderSelectedFields(fields);

	const result = mapResultRow(
		columns,
		[null, null],
		{
			joined: false,
		},
	);

	expect(result).toEqual({
		joined: null,
	});
});

test('mapResultRow matches issue #1603 branding.logo-null panelBackground-non-null case', () => {
	const orgBrandingTable = pgTable('org_branding', {
		logo: text('logo'),
		panelBackground: text('panel_background').notNull(),
	});

	const fields = {
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	};

	const columns = orderSelectedFields(fields);

	const result = mapResultRow(
		columns,
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
