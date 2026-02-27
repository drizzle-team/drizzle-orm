import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	pgEnum,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
} from 'drizzle-orm/pg-core';
import { generateLatestSnapshot } from 'src/dialects/postgres/serializer';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { describe, expect, test } from 'vitest';
import { diff } from './mocks';
import { expectedSnapshotFromSchema, snapshotFromSchema } from './serializer-snapshot.helpers';

type TransitionCase = {
	name: string;
	from: Record<string, unknown>;
	to: Record<string, unknown>;
	renames?: string[];
	expectedTypes: JsonStatement['type'][];
};

async function expectTransition(caseData: TransitionCase) {
	const base = snapshotFromSchema('snapshot-1', caseData.from as never);
	const { statements } = await diff(caseData.from, caseData.to, caseData.renames ?? []);

	const actual = generateLatestSnapshot(base, statements);
	const expected = expectedSnapshotFromSchema(base, caseData.to as never);

	for (const type of caseData.expectedTypes) {
		expect(
			statements.some((statement) => statement.type === type),
			`${caseData.name} should include ${type}. got: ${statements.map((it) => it.type).join(', ')}`,
		).toBe(true);
	}

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

	const ddlEntries = (snapshot: ReturnType<typeof snapshotFromSchema>) =>
		snapshot.ddl
			.map((entry) => JSON.stringify(stable(entry)))
			.sort((left, right) => left.localeCompare(right));

	expect({ ...actual, ddl: ddlEntries(actual) }).toStrictEqual({
		...expected,
		ddl: ddlEntries(expected),
	});
}

function buildTransitions(): TransitionCase[] {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
		name: integer('name'),
	});

	const dev = pgSchema('dev');
	const analytics = pgSchema('analytics');

	const statusA = pgEnum('status', ['a']);
	const statusAB = pgEnum('status', ['a', 'b']);

	const parentRef = pgTable('parent_ref', { id: integer('id').primaryKey() });
	const childRef = pgTable('child_ref', {
		id: integer('id').primaryKey(),
		parentId: integer('parent_id').references(() => parentRef.id),
	});

	const childRefCascade = pgTable('child_ref', {
		id: integer('id').primaryKey(),
		parentId: integer('parent_id').references(() => parentRef.id, {
			onDelete: 'cascade',
		}),
	});

	return [
		{
			name: 'rename table',
			from: { users: pgTable('users', { id: integer('id') }) },
			to: { customers: pgTable('customers', { id: integer('id') }) },
			renames: ['public.users->public.customers'],
			expectedTypes: ['rename_table'],
		},
		{
			name: 'add column',
			from: { users: pgTable('users', { id: integer('id') }) },
			to: {
				users: pgTable('users', { id: integer('id'), age: integer('age') }),
			},
			expectedTypes: ['add_column'],
		},
		{
			name: 'drop column',
			from: {
				users: pgTable('users', { id: integer('id'), age: integer('age') }),
			},
			to: { users: pgTable('users', { id: integer('id') }) },
			expectedTypes: ['drop_column'],
		},
		{
			name: 'rename column',
			from: {
				users: pgTable('users', { id: integer('id'), age: integer('age') }),
			},
			to: {
				users: pgTable('users', {
					id: integer('id'),
					years: integer('years'),
				}),
			},
			renames: ['public.users.age->public.users.years'],
			expectedTypes: ['rename_column'],
		},
		{
			name: 'alter column',
			from: { users: pgTable('users', { id: integer('id') }) },
			to: { users: pgTable('users', { id: integer('id').notNull() }) },
			expectedTypes: ['alter_column'],
		},
		{
			name: 'add index',
			from: {
				users: pgTable('users', { id: integer('id'), age: integer('age') }),
			},
			to: {
				users: pgTable(
					'users',
					{ id: integer('id'), age: integer('age') },
					(t) => [index('users_age_idx').on(t.age)],
				),
			},
			expectedTypes: ['create_index'],
		},
		{
			name: 'drop index',
			from: {
				users: pgTable(
					'users',
					{ id: integer('id'), age: integer('age') },
					(t) => [index('users_age_idx').on(t.age)],
				),
			},
			to: {
				users: pgTable('users', { id: integer('id'), age: integer('age') }),
			},
			expectedTypes: ['drop_index'],
		},
		{
			name: 'add pk',
			from: {
				users: pgTable('users', {
					id: integer('id').notNull(),
					name: integer('name'),
				}),
			},
			to: {
				users: pgTable(
					'users',
					{ id: integer('id').notNull(), name: integer('name') },
					(t) => [primaryKey({ columns: [t.id] })],
				),
			},
			expectedTypes: ['add_pk'],
		},
		{
			name: 'alter pk',
			from: {
				users: pgTable(
					'users',
					{ id: integer('id').notNull(), name: integer('name').notNull() },
					(t) => [primaryKey({ columns: [t.id] })],
				),
			},
			to: {
				users: pgTable(
					'users',
					{ id: integer('id').notNull(), name: integer('name').notNull() },
					(t) => [primaryKey({ columns: [t.id, t.name] })],
				),
			},
			expectedTypes: ['alter_pk'],
		},
		{
			name: 'recreate fk',
			from: { parentRef, childRef },
			to: { parentRef, childRefCascade },
			expectedTypes: ['recreate_fk'],
		},
		{
			name: 'alter check',
			from: {
				users: pgTable('users', { id: integer('id') }, (t) => [
					check('users_id_chk', sql`${t.id} > 0`),
				]),
			},
			to: {
				users: pgTable('users', { id: integer('id') }, (t) => [
					check('users_id_chk', sql`${t.id} > 1`),
				]),
			},
			expectedTypes: ['alter_check'],
		},
		{
			name: 'create and rename schema',
			from: { dev, users: dev.table('users', { id: integer('id') }) },
			to: {
				analytics,
				users: analytics.table('users', { id: integer('id') }),
			},
			renames: ['dev->analytics'],
			expectedTypes: ['rename_schema'],
		},
		{
			name: 'set new schema for table',
			from: { dev, users: pgTable('users', { id: integer('id') }) },
			to: { dev, users: dev.table('users', { id: integer('id') }) },
			renames: ['public.users->dev.users'],
			expectedTypes: ['move_table'],
		},
		{
			name: 'create and alter enum',
			from: {
				statusA,
				items: pgTable('items', {
					id: integer('id'),
					status: statusA('status'),
				}),
			},
			to: {
				statusAB,
				items: pgTable('items', {
					id: integer('id'),
					status: statusAB('status'),
				}),
			},
			expectedTypes: ['alter_enum'],
		},
		{
			name: 'drop enum value',
			from: {
				statusAB,
				items: pgTable('items', {
					id: integer('id'),
					status: statusAB('status'),
				}),
			},
			to: {
				statusA,
				items: pgTable('items', {
					id: integer('id'),
					status: statusA('status'),
				}),
			},
			expectedTypes: ['recreate_enum'],
		},
		{
			name: 'create and alter sequence',
			from: { seq: pgSequence('id_seq') },
			to: { seq: pgSequence('id_seq', { increment: '10' }) },
			expectedTypes: ['alter_sequence'],
		},
		{
			name: 'rename role',
			from: { manager: pgRole('manager') },
			to: { admin: pgRole('admin') },
			renames: ['manager->admin'],
			expectedTypes: ['rename_role'],
		},
		{
			name: 'alter role',
			from: { manager: pgRole('manager') },
			to: { manager: pgRole('manager', { createDb: true }) },
			expectedTypes: ['alter_role'],
		},
		{
			name: 'rename view',
			from: {
				users,
				v: pgView('users_view', { id: integer('id') }).as(
					sql`select id from ${users}`,
				),
			},
			to: {
				users,
				v: pgView('customers_view', { id: integer('id') }).as(
					sql`select id from ${users}`,
				),
			},
			renames: ['public.users_view->public.customers_view'],
			expectedTypes: ['rename_view'],
		},
	];
}

describe('generateLatestSnapshot', () => {
	const transitions = buildTransitions();

	test.each(transitions)('$name', async (transition) => {
		await expectTransition(transition);
	});
});
