import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkHandler } from 'src/cli/commands/check';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { expect, test } from 'vitest';
import { drizzleToDDL, type PostgresSchema } from '../postgres/mocks';

const ORIGIN = '00000000-0000-0000-0000-000000000000';

function makeSnapshot(
	id: string,
	prevIds: string[],
	schema: PostgresSchema,
): PostgresSnapshot {
	return {
		version: '8',
		dialect: 'postgres',
		id,
		prevIds,
		ddl: drizzleToDDL(schema).ddl.entities.list(),
		renames: [],
	};
}

function snapshotPath(out: string, tag: string, snapshot: PostgresSnapshot) {
	const folder = join(out, tag);
	mkdirSync(folder, { recursive: true });
	const path = join(folder, 'snapshot.json');
	writeFileSync(path, JSON.stringify(snapshot, null, 2));
	return path;
}

test('returns aggregated leaf statements with common parent snapshot for commutative open branches', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	const parentSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
	};

	const leftSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		likes: pgTable('likes', {
			id: integer('id'),
		}),
	};

	const rightSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
		}),
	};

	const parent = makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = makeSnapshot('a1', ['p1'], leftSchema);
	const right = makeSnapshot('b1', ['p1'], rightSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect(result.parentSnapshot).not.toBeNull();
	expect((result.parentSnapshot as PostgresSnapshot).id).toBe('p1');
	expect(result.leafIds).toStrictEqual(['a1', 'b1']);
	expect(result.statements.length).toBeGreaterThan(0);
});

test('returns empty statements when branches are already merged into one leaf', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	const parentSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
	};

	const leftSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		likes: pgTable('likes', {
			id: integer('id'),
		}),
	};

	const rightSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
		}),
	};

	const mergedSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		likes: pgTable('likes', {
			id: integer('id'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
		}),
	};

	const parent = makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = makeSnapshot('a1', ['p1'], leftSchema);
	const right = makeSnapshot('b1', ['p1'], rightSchema);
	const merged = makeSnapshot('m1', ['a1', 'b1'], mergedSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);
	snapshotPath(out, '003_merged', merged);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect(result.statements).toStrictEqual([]);
	expect(result.parentSnapshot).toBeNull();
	expect(result.nonCommutativityMessage).toBeUndefined();
});

test('returns non-commutativity message and no statements for conflicting branches', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	const parentSchema = {
		users: pgTable('users', {
			email: varchar('email'),
		}),
	};

	const leftSchema = {
		users: pgTable('users', {
			email: varchar('email').notNull(),
		}),
	};

	const rightSchema = {
		users: pgTable('users', {
			email: integer('email'),
		}),
	};

	const parent = makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = makeSnapshot('a1', ['p1'], leftSchema);
	const right = makeSnapshot('b1', ['p1'], rightSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect(result.statements).toStrictEqual([]);
	expect(result.nonCommutativityMessage).toContain(
		'Non-commutative migrations detected',
	);
});

test('ignoreConflicts keeps all open leaf ids for conflicting branches', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	const parentSchema = {
		users: pgTable('users', {
			email: varchar('email'),
		}),
	};

	const leftSchema = {
		users: pgTable('users', {
			email: varchar('email').notNull(),
		}),
	};

	const rightSchema = {
		users: pgTable('users', {
			email: integer('email'),
		}),
	};

	const parent = makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = makeSnapshot('a1', ['p1'], leftSchema);
	const right = makeSnapshot('b1', ['p1'], rightSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);

	const result = await checkHandler(out, 'postgresql', true, false);

	expect(result.statements).toStrictEqual([]);
	expect(result.parentSnapshot).toBeNull();
	expect(result.leafIds).toStrictEqual(['a1', 'b1']);
	expect(result.nonCommutativityMessage).toBeUndefined();
});

test('does not report conflicts when sibling branches converge to the same terminal leaf', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	const rootSchema = {};
	const parentSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
	};
	const leftSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		likes: pgTable('likes', {
			id: integer('id'),
		}),
	};
	const rightSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
		}),
	};
	const mergedSchema = {
		users: pgTable('users', {
			id: integer('id'),
		}),
		likes: pgTable('likes', {
			id: integer('id'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
		}),
	};

	const root = makeSnapshot('r1', [ORIGIN], rootSchema);
	const parent = makeSnapshot('p1', ['r1'], parentSchema);
	const left = makeSnapshot('a1', ['p1'], leftSchema);
	const right = makeSnapshot('b1', ['p1'], rightSchema);
	const merged = makeSnapshot('m1', ['a1', 'b1'], mergedSchema);

	snapshotPath(out, '000_root', root);
	snapshotPath(out, '001_parent', parent);
	snapshotPath(out, '002_left', left);
	snapshotPath(out, '003_right', right);
	snapshotPath(out, '004_merged', merged);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect(result.statements).toStrictEqual([]);
	expect(result.parentSnapshot).toBeNull();
	expect(result.nonCommutativityMessage).toBeUndefined();
});

test('reports only active leaf conflict after branch merge and re-split', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	const rootSchema = {
		users: pgTable('users', {
			id: integer('id'),
			text: varchar('text'),
		}),
	};
	const parentSchema = {
		users: pgTable('users', {
			id: integer('id'),
			text: varchar('text'),
		}),
		posts: pgTable('posts', {
			id: integer('id'),
			text: varchar('text'),
		}),
	};
	const leftSchema = {
		...parentSchema,
		likes: pgTable('likes', {
			id: integer('id'),
			text: varchar('text'),
		}),
	};
	const rightSchema = {
		...parentSchema,
		groups: pgTable('groups', {
			id: integer('id'),
			text: varchar('text'),
		}),
	};
	const mergedSchema = {
		...parentSchema,
		likes: pgTable('likes', {
			id: integer('id'),
			text: varchar('text'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
			text: varchar('text'),
		}),
	};
	const splitOneSchema = {
		...parentSchema,
		likes: pgTable('likes', {
			id: integer('id'),
			text: varchar('text'),
		}),
		groups: pgTable('groups', {
			id: integer('id'),
		}),
	};
	const splitTwoSchema = {
		...splitOneSchema,
	};

	const root = makeSnapshot('r1', [ORIGIN], rootSchema);
	const parent = makeSnapshot('p1', ['r1'], parentSchema);
	const left = makeSnapshot('a1', ['p1'], leftSchema);
	const right = makeSnapshot('b1', ['p1'], rightSchema);
	const merged = makeSnapshot('m1', ['a1', 'b1'], mergedSchema);
	const splitOne = makeSnapshot('s1', ['m1'], splitOneSchema);
	const splitTwo = makeSnapshot('s2', ['m1'], splitTwoSchema);

	snapshotPath(out, '000_root', root);
	snapshotPath(out, '001_parent', parent);
	snapshotPath(out, '002_left', left);
	snapshotPath(out, '003_right', right);
	snapshotPath(out, '004_merged', merged);
	snapshotPath(out, '005_split_one', splitOne);
	snapshotPath(out, '006_split_two', splitTwo);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect(result.nonCommutativityMessage).toContain(
		'drop_column: text on groups table',
	);
	expect(result.nonCommutativityMessage).not.toContain(
		'create_table: groups in public schema',
	);
});
