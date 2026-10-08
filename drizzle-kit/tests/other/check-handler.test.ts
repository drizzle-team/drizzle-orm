import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkHandler, checkSnapshots } from 'src/cli/commands/check';
import { readFolder } from 'src/dialects/postgres/folder';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { expect, test } from 'vitest';
import { makePgSnapshot as makeSnapshot } from './check-fixtures';

const ORIGIN = '00000000-0000-0000-0000-000000000000';

function snapshotPath(out: string, tag: string, snapshot: PostgresSnapshot) {
	const folder = join(out, tag);
	mkdirSync(folder, { recursive: true });
	const path = join(folder, 'snapshot.json');
	writeFileSync(path, JSON.stringify(snapshot, null, 2));
	return path;
}

test('returns every open leaf for commutative open branches', async () => {
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

	const parent = await makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = await makeSnapshot('a1', ['p1'], leftSchema, parentSchema);
	const right = await makeSnapshot('b1', ['p1'], rightSchema, parentSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);

	const { report, fix } = await checkSnapshots(readFolder(out).files, 'postgresql');

	expect(report.leafNodes).toStrictEqual(['a1', 'b1']);
	expect(report.conflicts).toStrictEqual([]);
	expect(fix).toBeUndefined();
});

test('returns one leaf and no conflicts when branches are already merged into one leaf', async () => {
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

	const parent = await makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = await makeSnapshot('a1', ['p1'], leftSchema, parentSchema);
	const right = await makeSnapshot('b1', ['p1'], rightSchema, parentSchema);
	const merged = await makeSnapshot('m1', ['a1', 'b1'], mergedSchema, mergedSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);
	snapshotPath(out, '003_merged', merged);

	const { report, fix } = await checkSnapshots(readFolder(out).files, 'postgresql');

	expect(report.leafNodes).toStrictEqual(['m1']);
	expect(report.conflicts).toStrictEqual([]);
	expect(fix).toBeUndefined();
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
			email: text('email'),
		}),
	};

	const rightSchema = {
		users: pgTable('users', {
			email: integer('email'),
		}),
	};

	const parent = await makeSnapshot('p1', [ORIGIN], parentSchema);
	const left = await makeSnapshot('a1', ['p1'], leftSchema, parentSchema);
	const right = await makeSnapshot('b1', ['p1'], rightSchema, parentSchema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_left', left);
	snapshotPath(out, '002_right', right);

	const result = await checkHandler(out, 'postgresql', false, false);

	expect(result.statements).toStrictEqual([]);
	expect(result.nonCommutativityMessage).toContain(
		'Conflicting migrations detected',
	);
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

	const root = await makeSnapshot('r1', [ORIGIN], rootSchema);
	const parent = await makeSnapshot('p1', ['r1'], parentSchema, rootSchema);
	const left = await makeSnapshot('a1', ['p1'], leftSchema, parentSchema);
	const right = await makeSnapshot('b1', ['p1'], rightSchema, parentSchema);
	const merged = await makeSnapshot('m1', ['a1', 'b1'], mergedSchema, mergedSchema);

	snapshotPath(out, '000_root', root);
	snapshotPath(out, '001_parent', parent);
	snapshotPath(out, '002_left', left);
	snapshotPath(out, '003_right', right);
	snapshotPath(out, '004_merged', merged);

	const { report, fix } = await checkSnapshots(readFolder(out).files, 'postgresql');

	expect(report.leafNodes).toStrictEqual(['m1']);
	expect(report.conflicts).toStrictEqual([]);
	expect(fix).toBeUndefined();
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

	const root = await makeSnapshot('r1', [ORIGIN], rootSchema);
	const parent = await makeSnapshot('p1', ['r1'], parentSchema, rootSchema);
	const left = await makeSnapshot('a1', ['p1'], leftSchema, parentSchema);
	const right = await makeSnapshot('b1', ['p1'], rightSchema, parentSchema);
	const merged = await makeSnapshot('m1', ['a1', 'b1'], mergedSchema, mergedSchema);
	const splitOne = await makeSnapshot('s1', ['m1'], splitOneSchema, mergedSchema);
	const splitTwo = await makeSnapshot('s2', ['m1'], splitTwoSchema, mergedSchema);

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

test('a nested open fork returns every open leaf', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	// p
	// ├── a (leaf)
	// └── b
	//     ├── bx (leaf)
	//     └── by (leaf)
	const t = (...names: string[]) =>
		Object.fromEntries(
			['t', ...names].map((name) => [name, pgTable(name, { id: integer('id') })]),
		);

	const p = await makeSnapshot('p1', [ORIGIN], t());
	const a = await makeSnapshot('a1', ['p1'], t('a'), t());
	const b = await makeSnapshot('b1', ['p1'], t('b'), t());
	const bx = await makeSnapshot('bx1', ['b1'], t('b', 'x'), t('b'));
	const by = await makeSnapshot('by1', ['b1'], t('b', 'y'), t('b'));

	snapshotPath(out, '000_p', p);
	snapshotPath(out, '001_a', a);
	snapshotPath(out, '002_b', b);
	snapshotPath(out, '003_bx', bx);
	snapshotPath(out, '004_by', by);

	const { report } = await checkSnapshots(readFolder(out).files, 'postgresql');

	expect(report.leafNodes).toStrictEqual(['a1', 'bx1', 'by1']);
});

test('an open fork with a deep branch returns only the open leaves', async () => {
	mkdirSync('tests/tmp', { recursive: true });
	const out = mkdtempSync('tests/tmp/dk-check-handler-');

	// parent (create t1)
	// ├── leaf1                  alter t1.a -> not null
	// └── leaf2 (create t2)
	//     └── leaf3              add fk t2.t1_id -> t1.id
	//         └── leaf4          alter t1.b -> not null
	// The open leaves are leaf1 and leaf4. leaf2 and leaf3 have children, so they are not leaves.
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

	const parent = await makeSnapshot('p1', [ORIGIN], parentSchema);
	const leaf1 = await makeSnapshot('l1', ['p1'], leaf1Schema, parentSchema);
	const leaf2 = await makeSnapshot('l2', ['p1'], leaf2Schema, parentSchema);
	const leaf3 = await makeSnapshot('l3', ['l2'], leaf3Schema, leaf2Schema);
	const leaf4 = await makeSnapshot('l4', ['l3'], leaf4Schema, leaf3Schema);

	snapshotPath(out, '000_parent', parent);
	snapshotPath(out, '001_leaf1', leaf1);
	snapshotPath(out, '002_leaf2', leaf2);
	snapshotPath(out, '003_leaf3', leaf3);
	snapshotPath(out, '004_leaf4', leaf4);

	const { report } = await checkSnapshots(readFolder(out).files, 'postgresql');

	expect(report.leafNodes).toStrictEqual(['l1', 'l4']);
});
