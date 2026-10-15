import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkHandler } from 'src/cli/commands/check';
import { createDDL } from 'src/dialects/postgres/ddl';
import { generateLatestSnapshot } from 'src/dialects/postgres/serializer';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
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

test('nested open fork merges all heads at their LCA with de-duplicated statements', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	// p
	// ├── a (leaf)
	// └── b
	//     ├── bx (leaf)
	//     └── by (leaf)
	// All three heads merge in one step based at their lowest common ancestor p.
	// bx and by both inherit `create table b`, so the per-head diffs overlap; the
	// merge migration must replay `create table b` exactly once.
	const t = (...names: string[]) =>
		Object.fromEntries(
			['t', ...names].map((name) => [name, pgTable(name, { id: integer('id') })]),
		);

	const p = makeSnapshot('p1', [ORIGIN], t());
	const a = makeSnapshot('a1', ['p1'], t('a'));
	const b = makeSnapshot('b1', ['p1'], t('b'));
	const bx = makeSnapshot('bx1', ['b1'], t('b', 'x'));
	const by = makeSnapshot('by1', ['b1'], t('b', 'y'));

	snapshotPath(out, '000_p', p);
	snapshotPath(out, '001_a', a);
	snapshotPath(out, '002_b', b);
	snapshotPath(out, '003_bx', bx);
	snapshotPath(out, '004_by', by);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect((result.parentSnapshot as PostgresSnapshot)?.id).toBe('p1');
	expect(result.leafIds).toStrictEqual(['a1', 'bx1', 'by1']);

	const createdTables = result.statements
		.filter((statement) => (statement as any).type === 'create_table')
		.map((statement) => (statement as any).table.name)
		.sort();
	// `t` already exists at the base p; `b` is inherited by both bx and by but
	// appears only once after de-duplication.
	expect(createdTables).toStrictEqual(['a', 'b', 'x', 'y']);
});

test('open merge composes alters and fk across a deep branch and a shallow branch', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	// parent (create t1)
	// ├── leaf1                  alter t1.a -> not null
	// └── leaf2 (create t2)
	//     └── leaf3              add fk t2.t1_id -> t1.id
	//         └── leaf4          alter t1.b -> not null
	// Open heads are leaf1 and leaf4 (leaf2/leaf3 are internal). Their lowest
	// common ancestor is the parent, so the merge composes one alter from the
	// shallow head and (create t2 + fk + the other alter) from the deep head.
	const parentSchema = {
		t1: pgTable('t1', {
			id: integer('id').primaryKey(),
			a: varchar('a'),
			b: varchar('b'),
		}),
	};

	const leaf1Schema = {
		t1: pgTable('t1', {
			id: integer('id').primaryKey(),
			a: varchar('a').notNull(),
			b: varchar('b'),
		}),
	};

	const leaf2Schema = {
		t1: pgTable('t1', {
			id: integer('id').primaryKey(),
			a: varchar('a'),
			b: varchar('b'),
		}),
		t2: pgTable('t2', {
			id: integer('id'),
			t1Id: integer('t1_id'),
		}),
	};

	const leaf3T1 = pgTable('t1', {
		id: integer('id').primaryKey(),
		a: varchar('a'),
		b: varchar('b'),
	});
	const leaf3Schema = {
		t1: leaf3T1,
		t2: pgTable('t2', {
			id: integer('id'),
			t1Id: integer('t1_id').references(() => leaf3T1.id),
		}),
	};

	const leaf4T1 = pgTable('t1', {
		id: integer('id').primaryKey(),
		a: varchar('a'),
		b: varchar('b').notNull(),
	});
	const leaf4Schema = {
		t1: leaf4T1,
		t2: pgTable('t2', {
			id: integer('id'),
			t1Id: integer('t1_id').references(() => leaf4T1.id),
		}),
	};

	const parent = makeSnapshot('p1', [ORIGIN], parentSchema);
	const leaf1 = makeSnapshot('l1', ['p1'], leaf1Schema);
	const leaf2 = makeSnapshot('l2', ['p1'], leaf2Schema);
	const leaf3 = makeSnapshot('l3', ['l2'], leaf3Schema);
	const leaf4 = makeSnapshot('l4', ['l3'], leaf4Schema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_leaf1', leaf1);
	snapshotPath(out, '002_leaf2', leaf2);
	snapshotPath(out, '003_leaf3', leaf3);
	snapshotPath(out, '004_leaf4', leaf4);

	const result = await checkHandler(out, 'postgresql', false, false);

	// Base is the LCA, and the merge parents are the open heads only — never the
	// internal leaf2/leaf3.
	expect((result.parentSnapshot as PostgresSnapshot)?.id).toBe('p1');
	expect(result.leafIds).toStrictEqual(['l1', 'l4']);

	// Reconstruct the merged snapshot exactly as the serializer does downstream,
	// then assert it is the union of both heads.
	const merged = generateLatestSnapshot(
		result.parentSnapshot as PostgresSnapshot,
		result.statements as JsonStatement[],
	);
	const ddl = createDDL();
	ddl.entities.pushAll(merged.ddl);

	// both alters landed, each coming from a different head
	expect(ddl.columns.one({ schema: 'public', table: 't1', name: 'a' })?.notNull).toBe(true);
	expect(ddl.columns.one({ schema: 'public', table: 't1', name: 'b' })?.notNull).toBe(true);
	// the deep branch's table and its fk landed
	expect(ddl.tables.one({ schema: 'public', name: 't2' })).not.toBeNull();
	expect(ddl.fks.list({ schema: 'public', table: 't2' }).length).toBe(1);
});
