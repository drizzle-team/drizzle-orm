import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	pgEnum,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { PostgresEntity } from 'src/dialects/postgres/ddl';
import { generateLatestSnapshot } from 'src/dialects/postgres/serializer';
import { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { JsonStatement } from 'src/dialects/postgres/statements';
import { describe, expect, test } from 'vitest';
import { diff, drizzleToDDL, PostgresSchema } from './mocks';

const originId = '00000000-0000-0000-0000-000000000000';

async function applyTransition(config: {
	from: PostgresSchema;
	to: PostgresSchema;
	renames: string[];
}) {
	const { from, renames, to } = config;

	const base: PostgresSnapshot = {
		version: '8',
		dialect: 'postgres',
		id: 'snapshot-id',
		prevIds: [originId],
		ddl: drizzleToDDL(from).ddl.entities.list(),
		renames: [],
	};

	const { statements } = await diff(from, to, renames ?? []);
	const actual = generateLatestSnapshot(base, statements);
	const expected = {
		...base,
		ddl: drizzleToDDL(to).ddl.entities.list(),
	};

	// sort keys alphabetically
	const stable = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value.map(stable);
		}
		if (value && typeof value === 'object') {
			return Object.fromEntries(
				Object.entries(value as Record<string, unknown>)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([key, entry]) => [key, stable(entry)]),
			);
		}
		return value;
	};

	// normalization engine
	// sort array of stringified ddl entries
	const ddlEntries = (ddl: PostgresEntity[]) =>
		ddl
			.map((entry) => JSON.stringify(stable(entry)))
			.sort((left, right) => left.localeCompare(right));

	const fromTs = { ...expected, ddl: ddlEntries(actual.ddl) };
	const afterPatch = { ...actual, ddl: ddlEntries(actual.ddl) };

	return { fromTs, afterPatch, statements };
}

describe('transition tests', () => {
	test('create table', async () => {
		const from = {};
		const to = { users: pgTable('users', { id: integer('id') }) };

		const expectedTypes: JsonStatement['type'][] = ['create_table'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));

		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop table', async () => {
		const from = { users: pgTable('users', { id: integer('id') }) };
		const to = {};

		const expectedTypes: JsonStatement['type'][] = ['drop_table'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));

		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename table', async () => {
		const from = { users: pgTable('users', { id: integer('id') }) };
		const to = { customers: pgTable('customers', { id: integer('id') }) };

		const expectedTypes: JsonStatement['type'][] = ['rename_table'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.users->public.customers'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));

		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('move table to another schema', async () => {
		const analytics = pgSchema('analytics');
		const from = {
			analytics,
			users: pgTable('users', {
				id: integer('id'),
			}),
		};
		const to = {
			analytics,
			users: analytics.table('users', {
				id: integer('id'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['move_table'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.users->analytics.users'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));

		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('remove custom schema from table', async () => {
		const analytics = pgSchema('analytics');
		const from = {
			analytics,

			users: analytics.table('users', {
				id: integer('id'),
			}),
		};
		const to = {
			analytics,
			users: pgTable('users', {
				id: integer('id'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['move_table'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['analytics.users->public.users'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));

		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('add column', async () => {
		const from = { users: pgTable('users', { id: integer('id') }) };
		const to = {
			users: pgTable('users', { id: integer('id'), age: integer('age') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['add_column'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));

		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop column', async () => {
		const from = {
			users: pgTable('users', { id: integer('id'), age: integer('age') }),
		};
		const to = { users: pgTable('users', { id: integer('id') }) };

		const expectedTypes: JsonStatement['type'][] = ['drop_column'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});
		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename column', async () => {
		const from = {
			users: pgTable('users', { id: integer('id'), age: integer('age') }),
		};
		const to = {
			users: pgTable('users', { id: integer('id'), years: integer('years') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_column'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.users.age->public.users.years'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter column', async () => {
		const from = { users: pgTable('users', { id: integer('id') }) };
		const to = {
			users: pgTable('users', { id: integer('id').notNull().default(0) }),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_column'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	// TODO
	// test("recreate_column", async () => {
	// });

	test('add index', async () => {
		const from = {
			users: pgTable('users', { id: integer('id'), age: integer('age') }),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id'), age: integer('age') },
				(t) => [index('users_age_idx').on(t.age)],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['create_index'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop index', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id'), age: integer('age') },
				(t) => [index('users_age_idx').on(t.age)],
			),
		};
		const to = {
			users: pgTable('users', { id: integer('id'), age: integer('age') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_index'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename index', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id'), age: integer('age') },
				(t) => [index('users_age_idx').on(t.age)],
			),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id'), age: integer('age') },
				(t) => [index('users_age_index').on(t.age)],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_index'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.users.users_age_idx->public.users.users_age_index'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('recreate index', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id'), age: integer('age') },
				(t) => [index('users_age_idx').on(t.age)],
			),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id'), age: integer('age') },
				(t) => [uniqueIndex('users_age_idx').on(t.age)],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['recreate_index'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('add pk', async () => {
		const from = {
			users: pgTable('users', {
				id: integer('id').notNull(),
				name: integer('name'),
			}),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name') },
				(t) => [primaryKey({ columns: [t.id, t.name] })],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['add_pk'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop pk', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name') },
				(t) => [primaryKey({ columns: [t.id, t.name] })],
			),
		};
		const to = {
			users: pgTable('users', {
				id: integer('id').notNull(),
				name: integer('name').notNull(),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_pk'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter pk', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name').notNull() },
				(t) => [primaryKey({ columns: [t.id] })],
			),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name').notNull() },
				(t) => [primaryKey({ columns: [t.id, t.name] })],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_pk'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create fk', async () => {
		const parentRef = pgTable('parent_ref', { id: integer('id').primaryKey() });

		const from = {
			parentRef,
			childRef: pgTable('child_ref', {
				id: integer('id').primaryKey(),
				parentId: integer('parent_id'),
			}),
		};
		const to = {
			parentRef,
			childRefCascade: pgTable('child_ref', {
				id: integer('id').primaryKey(),
				parentId: integer('parent_id').references(() => parentRef.id, {
					onDelete: 'cascade',
				}),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['create_fk'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop fk', async () => {
		const parentRef = pgTable('parent_ref', { id: integer('id').primaryKey() });

		const from = {
			parentRef,
			childRefCascade: pgTable('child_ref', {
				id: integer('id').primaryKey(),
				parentId: integer('parent_id').references(() => parentRef.id, {
					onDelete: 'cascade',
				}),
			}),
		};
		const to = {
			parentRef,
			childRef: pgTable('child_ref', {
				id: integer('id').primaryKey(),
				parentId: integer('parent_id'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_fk'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('recreate fk', async () => {
		const parentRef = pgTable('parent_ref', { id: integer('id').primaryKey() });

		const from = {
			parentRef,
			childRef: pgTable('child_ref', {
				id: integer('id').primaryKey(),
				parentId: integer('parent_id').references(() => parentRef.id),
			}),
		};
		const to = {
			parentRef,
			childRefCascade: pgTable('child_ref', {
				id: integer('id').primaryKey(),
				parentId: integer('parent_id').references(() => parentRef.id, {
					onDelete: 'cascade',
				}),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['recreate_fk'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('add unique constraint', async () => {
		const from = {
			users: pgTable('users', {
				id: integer('id').notNull(),
				name: integer('name'),
			}),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name') },
				(t) => [unique('users_name_idx').on(t.name)],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['add_unique'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop unique constraint', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name') },
				(t) => [unique('users_name_idx').on(t.name)],
			),
		};
		const to = {
			users: pgTable('users', {
				id: integer('id').notNull(),
				name: integer('name'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_unique'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter unique constraint', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name') },
				(t) => [unique('users_name_idx').on(t.name)],
			),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id').notNull(), name: integer('name') },
				(t) => [unique('users_name_idx').on(t.name, t.id)],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_unique'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('add check constraint', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }, (t) => [
				check('users_id_chk', sql`${t.id} > 0`),
			]),
		};

		const expectedTypes: JsonStatement['type'][] = ['add_check'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop check constraint', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }, (t) => [
				check('users_id_chk', sql`${t.id} > 0`),
			]),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_check'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter check constraint', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }, (t) => [
				check('users_id_chk', sql`${t.id} > 0`),
			]),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }, (t) => [
				check('users_id_chk', sql`${t.id} < 0`),
			]),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_check'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename constraint', async () => {
		const from = {
			users: pgTable(
				'users',
				{ id: integer('id'), name: varchar('name') },
				(t) => [
					check('users_id_chk', sql`${t.id} > 0`),
					unique('users_name_idx').on(t.name),
				],
			),
		};
		const to = {
			users: pgTable(
				'users',
				{ id: integer('id'), name: varchar('name') },
				(t) => [
					check('users_id_check', sql`${t.id} > 0`),
					unique('users_name_idx').on(t.name),
				],
			),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_constraint'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.users.users_id_chk->public.users.users_id_check'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create schema', async () => {
		const dev = pgSchema('dev');

		const from = {};
		const to = { dev };

		const expectedTypes: JsonStatement['type'][] = ['create_schema'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop schema', async () => {
		const dev = pgSchema('dev');
		const analytics = pgSchema('analytics');

		const from = { dev, analytics };
		const to = { analytics };

		const expectedTypes: JsonStatement['type'][] = ['drop_schema'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename schema', async () => {
		const dev = pgSchema('dev');
		const analytics = pgSchema('analytics');

		const from = { dev, users: dev.table('users', { id: integer('id') }) };
		const to = {
			analytics,
			users: analytics.table('users', { id: integer('id') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_schema'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['dev->analytics'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create enum', async () => {
		const statusA = pgEnum('status', ['a', 'b']);

		const from = {
			items: pgTable('items', {
				id: integer('id'),
			}),
		};
		const to = {
			statusA,
			items: pgTable('items', {
				id: integer('id'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['create_enum'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop enum', async () => {
		const statusA = pgEnum('status', ['a', 'b']);

		const from = {
			statusA,
			items: pgTable('items', {
				id: integer('id'),
			}),
		};
		const to = {
			items: pgTable('items', {
				id: integer('id'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_enum'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename enum', async () => {
		const statusA = pgEnum('status', ['a', 'b']);
		const renamedStatus = pgEnum('status_renamed', ['a', 'b']);

		const from = {
			statusA,
			items: pgTable('items', {
				id: integer('id'),
				statusEnum: statusA('status'),
			}),
		};
		const to = {
			statusA: renamedStatus,
			items: pgTable('items', {
				id: integer('id'),
				statusEnum: renamedStatus('status'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_enum'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.status->public.status_renamed'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create schema + move enum to other schema', async () => {
		const dev = pgSchema('dev');
		const statusA = pgEnum('status', ['a', 'b']);
		const movedStatusA = pgSchema('dev').enum('status', ['a', 'b']);

		const from = {
			statusA,
			items: pgTable('items', {
				id: integer('id'),
				status: statusA('status'),
			}),
		};
		const to = {
			dev,
			statusA: movedStatusA,
			items: pgTable('items', {
				id: integer('id'),
				status: movedStatusA('status'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = [
			'create_schema',
			'move_enum',
		];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.status->dev.status'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter enum (add value)', async () => {
		const statusA = pgEnum('status', ['a', 'b']);
		const statusAB = pgEnum('status', ['a', 'b', 'c']);

		const from = {
			statusA,
			items: pgTable('items', {
				id: integer('id'),
				status: statusA('status'),
			}),
		};
		const to = {
			statusAB,
			items: pgTable('items', {
				id: integer('id'),
				status: statusAB('status'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_enum'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter enum (drop value)', async () => {
		const statusA = pgEnum('status', ['a', 'b']);
		const statusAB = pgEnum('status', ['a', 'b', 'c']);

		const from = {
			statusAB,
			items: pgTable('items', {
				id: integer('id'),
				status: statusAB('status'),
			}),
		};
		const to = {
			statusA,
			items: pgTable('items', {
				id: integer('id'),
				status: statusA('status'),
			}),
		};

		const expectedTypes: JsonStatement['type'][] = ['recreate_enum'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create sequence', async () => {
		const from = {};
		const to = { seq: pgSequence('id_seq', { increment: '10' }) };

		const expectedTypes: JsonStatement['type'][] = ['create_sequence'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter sequence', async () => {
		const from = { seq: pgSequence('id_seq') };
		const to = { seq: pgSequence('id_seq', { increment: '10' }) };

		const expectedTypes: JsonStatement['type'][] = ['alter_sequence'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename sequence', async () => {
		const from = { seq: pgSequence('id_seq') };
		const to = { seqRenamed: pgSequence('id_seq_renamed') };

		const expectedTypes: JsonStatement['type'][] = ['rename_sequence'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.id_seq->public.id_seq_renamed'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('move sequence to another schema', async () => {
		const dev = pgSchema('dev');

		const from = { dev, seq: pgSequence('id_seq') };
		const to = { dev, seq: dev.sequence('id_seq') };

		const expectedTypes: JsonStatement['type'][] = ['move_sequence'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.id_seq->dev.id_seq'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create policy', async () => {
		const users = pgTable.withRLS('users', { id: integer('id') });

		const from = { users };
		const to = {
			users,
			policy: pgPolicy('users_policy', { for: 'select', to: 'public' }).link(users),
		};

		const expectedTypes: JsonStatement['type'][] = ['create_policy'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop policy', async () => {
		const users = pgTable.withRLS('users', { id: integer('id') });

		const from = {
			users,
			policy: pgPolicy('users_policy', { for: 'select', to: 'public' }).link(users),
		};
		const to = { users };

		const expectedTypes: JsonStatement['type'][] = ['drop_policy'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename policy', async () => {
		const users = pgTable.withRLS('users', { id: integer('id') });

		const from = {
			users,
			policy: pgPolicy('users_policy', { for: 'select', to: 'public' }).link(users),
		};
		const to = {
			users,
			policy: pgPolicy('users_policy_renamed', { for: 'select', to: 'public' }).link(users),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_policy'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.users.users_policy->public.users.users_policy_renamed'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter policy', async () => {
		const users = pgTable.withRLS('users', { id: integer('id') });

		const from = {
			users,
			policy: pgPolicy('users_policy', { for: 'select', to: 'public', using: sql`` }).link(users),
		};
		const to = {
			users,
			policy: pgPolicy('users_policy', { for: 'select', to: 'public', using: sql`1` }).link(users),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_policy'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('recreate policy', async () => {
		const users = pgTable.withRLS('users', { id: integer('id') });

		const from = {
			users,
			policy: pgPolicy('users_policy', { for: 'select', to: 'public' }).link(users),
		};
		const to = {
			users,
			policy: pgPolicy('users_policy', {
				for: 'insert',
				to: 'public',
			}).link(users),
		};

		const expectedTypes: JsonStatement['type'][] = ['recreate_policy'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter rls', async () => {
		const from = {
			users: pgTable.withRLS('users', { id: integer('id') }),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_rls'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create role', async () => {
		const from = {};
		const to = { manager: pgRole('manager') };

		const expectedTypes: JsonStatement['type'][] = ['create_role'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop role', async () => {
		const from = { manager: pgRole('manager') };
		const to = {};

		const expectedTypes: JsonStatement['type'][] = ['drop_role'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename role', async () => {
		const from = { manager: pgRole('manager') };
		const to = { manager: pgRole('manager2') };

		const expectedTypes: JsonStatement['type'][] = ['rename_role'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['manager->manager2'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter role', async () => {
		const from = { manager: pgRole('manager') };
		const to = { manager: pgRole('manager', { createDb: true }) };

		const expectedTypes: JsonStatement['type'][] = ['alter_role'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('create view', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }),
			active_users: pgView('active_users', {
				id: integer('id'),
			}).as(sql`SELECT id FROM users WHERE active = true`),
		};

		const expectedTypes: JsonStatement['type'][] = ['create_view'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('drop view', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }),
			active_users: pgView('active_users', {
				id: integer('id'),
			}).as(sql`SELECT id FROM users WHERE active = true`),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }),
		};

		const expectedTypes: JsonStatement['type'][] = ['drop_view'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('rename view', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }),
			active_users: pgView('active_users', {
				id: integer('id'),
			}).as(sql`SELECT id FROM users WHERE active = true`),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }),
			active_customers: pgView('active_customers', {
				id: integer('id'),
			}).as(sql`SELECT id FROM users WHERE active = true`),
		};

		const expectedTypes: JsonStatement['type'][] = ['rename_view'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.active_users->public.active_customers'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('move view to another schema', async () => {
		const dev = pgSchema('dev');

		const from = {
			dev,
			users: pgTable('users', { id: integer('id') }),
			active_users: pgView('active_users', {
				id: integer('id'),
			}).as(sql`SELECT id FROM users WHERE active = true`),
		};
		const to = {
			dev,
			users: pgTable('users', { id: integer('id') }),
			active_users: dev
				.view('active_users', {
					id: integer('id'),
				})
				.as(sql`SELECT id FROM users WHERE active = true`),
		};

		const expectedTypes: JsonStatement['type'][] = ['move_view'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: ['public.active_users->dev.active_users'],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});

	test('alter view', async () => {
		const from = {
			users: pgTable('users', { id: integer('id') }),
			active_users: pgView('active_users', {
				id: integer('id'),
			}).as(sql`SELECT id, name FROM users WHERE active = true`),
		};
		const to = {
			users: pgTable('users', { id: integer('id') }),
			active_users: pgView('active_users', {
				id: integer('id'),
				name: varchar('name'),
			}).with({ checkOption: 'local' }).as(sql`SELECT id, name FROM users WHERE active = true`),
		};

		const expectedTypes: JsonStatement['type'][] = ['alter_view'];

		const { afterPatch, fromTs, statements } = await applyTransition({
			from,
			to,
			renames: [],
		});

		expect(
			statements.map((it) => it.type).sort((a, b) => a.localeCompare(b)),
			`Inconsistent statement types. Expected: ${expectedTypes.join(', ')}. Actual: ${
				statements
					.map((s) => s.type)
					.join(', ')
			}`,
		).toStrictEqual(expectedTypes.sort((a, b) => a.localeCompare(b)));
		expect(afterPatch).toStrictEqual(fromTs);
	});
});
