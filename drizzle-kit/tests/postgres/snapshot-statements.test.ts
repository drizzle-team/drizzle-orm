import { sql } from 'drizzle-orm';
import { integer, pgSchema, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { toSnapshotStatements } from 'src/dialects/postgres/convertor';
import { isSnapshotStatement } from 'src/dialects/postgres/snapshot';
import { type SnapshotStatement, snapshotStatementSchemas } from 'src/dialects/postgres/snapshot-statements';
import { describe, expect, test } from 'vitest';
import { diff, type PostgresSchema } from './mocks';

// Each case is a real diff that writes statements of the named kinds.
type Case = { kinds: string[]; from: PostgresSchema; to: PostgresSchema; renames?: string[] };

const archive = pgSchema('archive');
const users = pgTable('users', { id: integer(), email: varchar() });

const cases: Case[] = [
	{ kinds: ['create_table'], from: {}, to: { users } },
	{ kinds: ['drop_table'], from: { users }, to: {} },
	{
		kinds: ['rename_table'],
		from: { users },
		to: { accounts: pgTable('accounts', { id: integer(), email: varchar() }) },
		renames: ['public.users->public.accounts'],
	},
	{
		kinds: ['move_table'],
		from: { archive, users },
		to: { archive, users: archive.table('users', { id: integer(), email: varchar() }) },
		renames: ['public.users->archive.users'],
	},
	{
		kinds: ['add_column', 'drop_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), name: text() }) },
	},
	{
		kinds: ['rename_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), contact: varchar() }) },
		renames: ['public.users.email->public.users.contact'],
	},
	{
		kinds: ['alter_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), email: text().notNull().default('none') }) },
	},
	{
		kinds: ['recreate_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), email: varchar().generatedAlwaysAs(sql`'x'`) }) },
	},
];

const storedStatements = async () => {
	const stored: SnapshotStatement[] = [];
	for (const { kinds, from, to, renames = [] } of cases) {
		const statements = toSnapshotStatements((await diff(from, to, renames)).statements);
		expect(statements.map((it) => it.type), `the kinds of the case for ${kinds.join(', ')}`).toStrictEqual(
			expect.arrayContaining(kinds),
		);
		stored.push(...statements);
	}
	// A snapshot holds the statements as JSON.
	return JSON.parse(JSON.stringify(stored)) as SnapshotStatement[];
};

// Every object inside `value`, with the path to it. An array is not an object here, and its items are.
const objectsIn = (value: unknown, path: string[] = []): { path: string[]; object: Record<string, unknown> }[] => {
	if (Array.isArray(value)) return value.flatMap((it, idx) => objectsIn(it, [...path, String(idx)]));
	if (value === null || typeof value !== 'object') return [];
	const object = value as Record<string, unknown>;
	return [{ path, object }, ...Object.entries(object).flatMap(([key, it]) => objectsIn(it, [...path, key]))];
};

const changedAt = (statement: unknown, path: string[], change: (object: Record<string, unknown>) => void) => {
	const copy = structuredClone(statement) as Record<string, any>;
	change(path.reduce((it, key) => it[key], copy));
	return copy;
};

describe('stored statements', () => {
	test('the cases cover every kind that has a stored form', async () => {
		const covered = new Set((await storedStatements()).map((it) => it.type));

		expect(Object.keys(snapshotStatementSchemas).filter((kind) => !covered.has(kind as never))).toStrictEqual([]);
	});

	test('a stored statement passes the validator', async () => {
		expect((await storedStatements()).filter((it) => !isSnapshotStatement(it))).toStrictEqual([]);
	});

	test('a stored statement with an unknown field at any depth is malformed', async () => {
		const accepted: string[] = [];
		for (const statement of await storedStatements()) {
			if (!Object.hasOwn(snapshotStatementSchemas, statement.type)) continue;
			for (const { path } of objectsIn(statement)) {
				const changed = changedAt(statement, path, (object) => {
					object.unknownField = 1;
				});
				if (isSnapshotStatement(changed)) accepted.push(`${statement.type} at ${path.join('.') || 'the top'}`);
			}
		}

		expect(accepted).toStrictEqual([]);
	});

	test('a stored statement with a missing field at any depth is malformed', async () => {
		const accepted: string[] = [];
		for (const statement of await storedStatements()) {
			if (!Object.hasOwn(snapshotStatementSchemas, statement.type)) continue;
			for (const { path, object } of objectsIn(statement)) {
				for (const field of Object.keys(object)) {
					// A changed property of an altered entity is present only when it changed.
					if (path.at(-1) === 'diff') continue;
					const changed = changedAt(statement, path, (it) => {
						delete it[field];
					});
					if (isSnapshotStatement(changed)) accepted.push(`${statement.type} without ${[...path, field].join('.')}`);
				}
			}
		}

		expect(accepted).toStrictEqual([]);
	});

	test('a stored row holds no entityType, and a stored create_table holds no indexes or foreign keys', async () => {
		const [createTable] = (await storedStatements()).filter((it) => it.type === 'create_table');

		expect(Object.keys(createTable.table).sort()).toStrictEqual([
			'checks',
			'columns',
			'enablesRls',
			'name',
			'pk',
			'schema',
			'uniques',
		]);
		expect(objectsIn(createTable).filter(({ object }) => 'entityType' in object)).toStrictEqual([]);
	});
});
