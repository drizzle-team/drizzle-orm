import { describe, expect, test } from 'vitest';
import { createDDL } from 'src/dialects/mssql/ddl';
import { ddlToTypeScript } from 'src/dialects/mssql/typescript';

// https://github.com/drizzle-team/drizzle-orm/issues/6410
describe('ddlToTypeScript extra-config separators', () => {
	test('emits a comma between unique() and check() in the table callback', () => {
		const ddl = createDDL();

		ddl.schemas.push({ name: 'Lookup' });
		ddl.tables.push({ schema: 'Lookup', name: 'Color' });
		ddl.columns.push({
			schema: 'Lookup',
			table: 'Color',
			name: 'ColorId',
			type: 'varchar(10)',
			notNull: true,
			generated: null,
			identity: null,
		});
		ddl.columns.push({
			schema: 'Lookup',
			table: 'Color',
			name: 'Name',
			type: 'varchar(100)',
			notNull: true,
			generated: null,
			identity: null,
		});
		ddl.pks.push({
			schema: 'Lookup',
			table: 'Color',
			name: 'PK_Color_ColorId',
			nameExplicit: true,
			columns: ['ColorId'],
		});
		ddl.uniques.push({
			schema: 'Lookup',
			table: 'Color',
			name: 'UQ_Color_Name',
			nameExplicit: true,
			columns: ['Name'],
		});
		ddl.checks.push({
			schema: 'Lookup',
			table: 'Color',
			name: 'CK_Color_Name_not_blank_string',
			value: '(len([Name])>(0))',
		});

		const { file } = ddlToTypeScript(ddl, [], 'preserve');

		expect(file).toContain('\tunique("UQ_Color_Name").on(table.Name),\n');
		expect(file).toContain('\tcheck("CK_Color_Name_not_blank_string", sql`(len([Name])>(0))`),\n');
		// the broken output glued the two entries together without a separator
		expect(file).not.toContain('.on(table.Name)\n\tcheck(');
	});

	test('emits one check() per line when several checks follow uniques', () => {
		const ddl = createDDL();

		ddl.tables.push({ schema: 'dbo', name: 'Color' });
		ddl.columns.push({
			schema: 'dbo',
			table: 'Color',
			name: 'Name',
			type: 'varchar(100)',
			notNull: true,
			generated: null,
			identity: null,
		});
		ddl.uniques.push({
			schema: 'dbo',
			table: 'Color',
			name: 'UQ_Color_Name',
			nameExplicit: true,
			columns: ['Name'],
		});
		ddl.checks.push({
			schema: 'dbo',
			table: 'Color',
			name: 'CK_Color_Name_a',
			value: '(len([Name])>(0))',
		});
		ddl.checks.push({
			schema: 'dbo',
			table: 'Color',
			name: 'CK_Color_Name_b',
			value: '(len([Name])<(100))',
		});

		const { file } = ddlToTypeScript(ddl, [], 'preserve');

		expect(file).toContain('\tunique("UQ_Color_Name").on(table.Name),\n');
		expect(file).toContain('\tcheck("CK_Color_Name_a", sql`(len([Name])>(0))`),\n');
		expect(file).toContain('\tcheck("CK_Color_Name_b", sql`(len([Name])<(100))`),\n');
	});
});
