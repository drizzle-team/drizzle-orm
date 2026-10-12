import { pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { prepareFromExports } from 'src/serializer/pgImports';

test('prepareFromExports: collects enums used in table columns but not directly exported', () => {
	// Simulates the pattern where enums are defined in a separate file (e.g. enums.ts)
	// and imported into schema.ts for use in tables, but not re-exported from schema.ts.
	// drizzle-kit push reads only the direct exports of the schema file, so without this
	// fix the enums would be invisible and CREATE TYPE statements would be omitted.

	const statusEnum = pgEnum('status', ['active', 'inactive', 'banned']);
	const roleEnum = pgEnum('role', ['admin', 'user']);

	const users = pgTable('users', {
		id: text('id').primaryKey(),
		status: statusEnum('status').notNull(),
		role: roleEnum('role').notNull(),
	});

	// Exports object does NOT include the enums — only the table (as would happen
	// when enums.ts exports the enums but schema.ts does not re-export them)
	const exportsWithoutEnums = { users };

	const { tables, enums } = prepareFromExports(exportsWithoutEnums);

	expect(tables).toHaveLength(1);
	expect(enums).toHaveLength(2);

	const enumNames = enums.map((e) => e.enumName).sort();
	expect(enumNames).toEqual(['role', 'status']);
});

test('prepareFromExports: does not duplicate enums that are both exported and used in columns', () => {
	const statusEnum = pgEnum('status', ['active', 'inactive']);

	const users = pgTable('users', {
		id: text('id').primaryKey(),
		status: statusEnum('status').notNull(),
	});

	// Both the enum and the table are exported (the normal case)
	const exportsWithBoth = { statusEnum, users };

	const { enums } = prepareFromExports(exportsWithBoth);

	expect(enums).toHaveLength(1);
	expect(enums[0].enumName).toBe('status');
});
