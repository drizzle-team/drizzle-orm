import { is, sql } from 'drizzle-orm';
import { int, SQLiteTable, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, test } from 'vitest';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema } from 'src/dialects/sqlite/drizzle';

// https://github.com/drizzle-team/drizzle-orm/issues/6408
// SQLite does not allow ALTER TABLE ADD COLUMN with a non-constant default:
// "The column may not have a default value of CURRENT_TIME, CURRENT_DATE,
// CURRENT_TIMESTAMP, or an expression in parentheses."
// https://www.sqlite.org/lang_altertable.html

const toDDL = (schema: Record<string, unknown>) => {
	const tables = Object.values(schema).filter((it) => is(it, SQLiteTable));
	return interimToDDL(fromDrizzleSchema(tables as any, [])).ddl;
};

const materials = (extra: Record<string, unknown> = {}) =>
	sqliteTable('materials', {
		materialNumber: int('material_number').primaryKey(),
		materialName: text('material_name').notNull(),
		...extra,
	});

describe('adding a column with a non-constant default', () => {
	test('recreates the table instead of ALTER TABLE ADD for an expression default', async () => {
		const before = toDDL({ materials: materials() });
		const after = toDDL({
			materials: materials({
				createdTimestamp: int('created_timestamp', { mode: 'timestamp' }).notNull().default(
					sql`(CURRENT_TIMESTAMP)`,
				),
			}),
		});

		const { sqlStatements, warnings } = await ddlDiffDry(before, after, 'default');

		expect(sqlStatements.some((it) => it.includes('ALTER TABLE `materials` ADD'))).toBe(false);
		expect(sqlStatements.some((it) => it.includes('CREATE TABLE `__new_materials`'))).toBe(true);
		expect(sqlStatements.some((it) => it.includes('INSERT INTO `__new_materials`'))).toBe(true);
		expect(warnings.length).toBeGreaterThan(0);
	});

	test('recreates the table for a CURRENT_TIMESTAMP default', async () => {
		const before = toDDL({ materials: materials() });
		const after = toDDL({
			materials: materials({
				createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
			}),
		});

		const { sqlStatements } = await ddlDiffDry(before, after, 'default');

		expect(sqlStatements.some((it) => it.includes('ALTER TABLE `materials` ADD'))).toBe(false);
		expect(sqlStatements.some((it) => it.includes('CREATE TABLE `__new_materials`'))).toBe(true);
	});

	test('keeps ALTER TABLE ADD for a constant default', async () => {
		const before = toDDL({ materials: materials() });
		const after = toDDL({
			materials: materials({
				stock: int('stock').notNull().default(0),
			}),
		});

		const { sqlStatements } = await ddlDiffDry(before, after, 'default');

		expect(sqlStatements.some((it) => it.includes('ALTER TABLE `materials` ADD `stock`'))).toBe(true);
		expect(sqlStatements.some((it) => it.includes('__new_materials'))).toBe(false);
	});
});
