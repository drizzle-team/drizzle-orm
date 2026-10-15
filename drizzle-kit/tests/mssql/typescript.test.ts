import { createDDL } from 'src/dialects/mssql/ddl';
import { ddlToTypeScript } from 'src/dialects/mssql/typescript';
import { tsc } from 'tests/utils';
import { expect, test } from 'vitest';

test.each([
	{ seed: 0, increment: 1 },
	{ seed: 0, increment: -1 },
	{ seed: 1, increment: 1 },
	{ seed: -10, increment: 2 },
])('preserves identity seed $seed and increment $increment in pulled TypeScript', async ({ seed, increment }) => {
	const ddl = createDDL();
	ddl.schemas.push({ name: 'dbo' });
	ddl.tables.push({ schema: 'dbo', name: 'Staff' });
	ddl.columns.push({
		schema: 'dbo',
		table: 'Staff',
		name: 'StaffId',
		type: 'int',
		notNull: true,
		generated: null,
		identity: { seed, increment },
	});

	const { file } = ddlToTypeScript(ddl, [], 'camel');

	expect(file).toContain(`staffId: int("StaffId").identity({ seed: ${seed} ,increment: ${increment} })`);
	await tsc(file);
});

test('does not add identity to a non-identity column in pulled TypeScript', () => {
	const ddl = createDDL();
	ddl.schemas.push({ name: 'dbo' });
	ddl.tables.push({ schema: 'dbo', name: 'Staff' });
	ddl.columns.push({
		schema: 'dbo',
		table: 'Staff',
		name: 'StaffId',
		type: 'int',
		notNull: true,
		generated: null,
		identity: null,
	});

	const { file } = ddlToTypeScript(ddl, [], 'camel');

	expect(file).toContain('staffId: int("StaffId").notNull()');
	expect(file).not.toContain('.identity(');
});
