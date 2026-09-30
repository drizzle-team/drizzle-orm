import { describe, expect, test } from 'vitest';
import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import { int, mysqlTable } from '~/mysql-core/index.ts';
import { Param, SQL } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

const testTable = mysqlTable('test', {
	id: int('id'),
	orgId: int('org_id'),
});
const brandingTable = mysqlTable('branding', {
	logo: int('logo'),
	panelBackground: int('panel_background'),
});

// minimal joinsNotNullableMap shape as produced by the select query builder:
// every entry maps a joined-table name to whether the join guarantees non-null rows
const joins = { test: true, branding: false } as any;

function col(column: Column): any {
	return { path: [] as string[], field: column };
}

describe('mapResultRow', () => {
	test('left join: nested object NOT nullified when first selected column is null but later column from same table is not', () => {
		// regression for drizzle-team/drizzle-orm#1603
		// select: { name, slug, branding: { logo, panelBackground } }
		const columns: any[] = [
			{ path: ['name'], field: testTable.id },
			{ path: ['slug'], field: testTable.orgId },
			{ path: ['branding', 'logo'], field: brandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: brandingTable.panelBackground },
		];
		// logo = NULL, panelBackground = '#1a8cff' (non-null)
		const mapped = mapResultRow(columns, ['Test org 2', 'test-org-2', null, 42], joins);
		expect(mapped.branding).toEqual({ logo: null, panelBackground: 42 });
	});

	test('left join: nested object nullified when ALL joined-table columns are null', () => {
		const columns: any[] = [
			{ path: ['name'], field: testTable.id },
			{ path: ['branding', 'logo'], field: brandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: brandingTable.panelBackground },
		];
		const mapped = mapResultRow(columns, ['Test org 2', null, null], joins);
		expect(mapped.branding).toBe(null);
	});

	test('left join: column-order independence — null first column does not nullify object', () => {
		// swapped order from the original issue report: panelBackground first
		const columns: any[] = [
			{ path: ['name'], field: testTable.id },
			{ path: ['branding', 'panelBackground'], field: brandingTable.panelBackground },
			{ path: ['branding', 'logo'], field: brandingTable.logo },
		];
		const mapped = mapResultRow(columns, ['Test org 2', 42, null], joins);
		expect(mapped.branding).toEqual({ panelBackground: 42, logo: null });
	});

	test('SQL fields do not participate in nullify decisions (Column-only contract)', () => {
		const sqlField = new SQL([]) as any;
		sqlField.decoder = { mapFromDriverValue: (v: any) => v };
		const columns: any[] = [
			{ path: ['branding', 'logo'], field: brandingTable.logo },
			{ path: ['branding', 'computed'], field: sqlField },
		];
		// only Column fields decide nullification; a lone null Column in a nullable join still nullifies
		const mapped = mapResultRow(columns, [null, 'x'], joins);
		expect(mapped.branding).toBe(null);
	});

	test('Param-wrapped-in-SQL fields do not participate in nullify tracking (Column-only contract)', () => {
		const param = new Param('x');
		expect(is(param, Column)).toBe(false);
		// in real query plans a Param reaches mapResultRow wrapped in SQL; mimic that
		const paramField = Object.assign(new SQL([param]), { decoder: { mapFromDriverValue: (v: any) => v } });
		const columns: any[] = [
			{ path: ['branding', 'logo'], field: brandingTable.logo },
			{ path: ['branding', 'literal'], field: paramField },
		];
		// Param/SQL fields never un-nullify an object — only non-null Column values can
		const mapped = mapResultRow(columns, [null, 'x'], joins);
		expect(mapped.branding).toBe(null);
	});
});
