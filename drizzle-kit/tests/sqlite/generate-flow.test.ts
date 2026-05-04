import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkHandler } from 'src/cli/commands/check';
import { ddlDiffDry } from 'src/dialects/sqlite/diff';
import { generateLatestSnapshot } from 'src/dialects/sqlite/serializer';
import type { SqliteSnapshot } from 'src/dialects/sqlite/snapshot';
import type { JsonStatement } from 'src/dialects/sqlite/statements';
import { describe, expect, test } from 'vitest';
import { drizzleToDDL, type SqliteSchema } from './mocks';

const ORIGIN = '00000000-0000-0000-0000-000000000000';

function makeSnapshot(
	id: string,
	prevIds: string[],
	schema: SqliteSchema,
): SqliteSnapshot {
	return {
		version: '7',
		dialect: 'sqlite',
		id,
		prevIds,
		ddl: drizzleToDDL(schema).ddl.entities.list(),
		renames: [],
	};
}

function snapshotPath(out: string, tag: string, snapshot: SqliteSnapshot) {
	const folder = join(out, tag);
	mkdirSync(folder, { recursive: true });
	const path = join(folder, 'snapshot.json');
	writeFileSync(path, JSON.stringify(snapshot, null, 2));
	return path;
}

function mkOut(prefix: string) {
	mkdirSync('tests/tmp', { recursive: true });
	return mkdtempSync(join(tmpdir(), prefix));
}

const stable = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, stable(v)]),
		);
	}
	return value;
};
const stableEntries = (entities: any[]) => entities.map((e) => JSON.stringify(stable(e))).sort();

const schemas = {
	users: {
		users: sqliteTable('users', { id: int('id') }),
	} satisfies SqliteSchema,
	usersWithEmail: {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
		}),
	} satisfies SqliteSchema,
	usersAndLikes: {
		users: sqliteTable('users', { id: int('id') }),
		likes: sqliteTable('likes', { id: int('id') }),
	} satisfies SqliteSchema,
	usersAndGroups: {
		users: sqliteTable('users', { id: int('id') }),
		groups: sqliteTable('groups', { id: int('id') }),
	} satisfies SqliteSchema,
	usersLikesAndGroups: {
		users: sqliteTable('users', { id: int('id') }),
		likes: sqliteTable('likes', { id: int('id') }),
		groups: sqliteTable('groups', { id: int('id') }),
	} satisfies SqliteSchema,
	usersAndPosts: {
		users: sqliteTable('users', { id: int('id') }),
		posts: sqliteTable('posts', { id: int('id') }),
	} satisfies SqliteSchema,
	usersWithEmailAndPosts: {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
		}),
		posts: sqliteTable('posts', { id: int('id') }),
	} satisfies SqliteSchema,
	usersEmailWithText: {
		users: sqliteTable('users', { id: int('id'), email: text('email') }),
	} satisfies SqliteSchema,
	usersEmailNotNull: {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email').notNull(),
		}),
	} satisfies SqliteSchema,
	usersEmailAsInt: {
		users: sqliteTable('users', { id: int('id'), email: int('email') }),
	} satisfies SqliteSchema,
};

describe('checkHandler (sqlite)', () => {
	test(
		'returns aggregated statements + parent snapshot for commutative open branches',
		async () => {
			const out = mkOut('dk-check-sqlite-');

			snapshotPath(out, '000_parent', makeSnapshot('p1', [ORIGIN], schemas.users));
			snapshotPath(out, '001_left', makeSnapshot('a1', ['p1'], schemas.usersAndLikes));
			snapshotPath(out, '002_right', makeSnapshot('b1', ['p1'], schemas.usersAndGroups));

			const result = await checkHandler(out, 'sqlite');

			expect(result.parentSnapshot).not.toBeNull();
			expect((result.parentSnapshot as SqliteSnapshot).id).toBe('p1');
			expect(result.leafIds).toStrictEqual(['a1', 'b1']);
			expect(result.statements.length).toBeGreaterThan(0);
			expect(result.nonCommutativityMessage).toBeUndefined();
		},
	);

	test('returns empty statements when branches already merged into one leaf', async () => {
		const out = mkOut('dk-check-sqlite-');

		snapshotPath(out, '000_parent', makeSnapshot('p1', [ORIGIN], schemas.users));
		snapshotPath(out, '001_left', makeSnapshot('a1', ['p1'], schemas.usersAndLikes));
		snapshotPath(out, '002_right', makeSnapshot('b1', ['p1'], schemas.usersAndGroups));
		snapshotPath(
			out,
			'003_merged',
			makeSnapshot('m1', ['a1', 'b1'], schemas.usersLikesAndGroups),
		);

		const result = await checkHandler(out, 'sqlite');

		expect(result.statements).toStrictEqual([]);
		expect(result.parentSnapshot).toBeNull();
		expect(result.nonCommutativityMessage).toBeUndefined();
	});

	test('reports non-commutativity for two branches altering the same column', async () => {
		const out = mkOut('dk-check-sqlite-');

		snapshotPath(out, '000_parent', makeSnapshot('p1', [ORIGIN], schemas.usersEmailWithText));
		snapshotPath(out, '001_left', makeSnapshot('a1', ['p1'], schemas.usersEmailNotNull));
		snapshotPath(out, '002_right', makeSnapshot('b1', ['p1'], schemas.usersEmailAsInt));

		const result = await checkHandler(out, 'sqlite', false, false);

		expect(result.statements).toStrictEqual([]);
		expect(result.nonCommutativityMessage).toContain(
			'Non-commutative migrations detected',
		);
	});

	test('ignoreConflicts keeps both leaf ids for conflicting branches', async () => {
		const out = mkOut('dk-check-sqlite-');

		snapshotPath(out, '000_parent', makeSnapshot('p1', [ORIGIN], schemas.usersEmailWithText));
		snapshotPath(out, '001_left', makeSnapshot('a1', ['p1'], schemas.usersEmailNotNull));
		snapshotPath(out, '002_right', makeSnapshot('b1', ['p1'], schemas.usersEmailAsInt));

		const result = await checkHandler(out, 'sqlite', true, false);

		expect(result.statements).toStrictEqual([]);
		expect(result.parentSnapshot).toBeNull();
		expect(result.leafIds).toStrictEqual(['a1', 'b1']);
	});
});

describe('generateLatestSnapshot (sqlite)', () => {
	async function applyTransition(from: SqliteSchema, to: SqliteSchema) {
		const fromDDL = drizzleToDDL(from).ddl;
		const toDDL = drizzleToDDL(to).ddl;
		const base: SqliteSnapshot = {
			version: '7',
			dialect: 'sqlite',
			id: 'snapshot-id',
			prevIds: [ORIGIN],
			ddl: fromDDL.entities.list(),
			renames: [],
		};
		const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
		const actual = generateLatestSnapshot(base, statements);
		return {
			actualDdl: stableEntries(actual.ddl),
			expectedDdl: stableEntries(toDDL.entities.list()),
			statements,
		};
	}

	test('create_table reproduces target ddl', async () => {
		const { actualDdl, expectedDdl, statements } = await applyTransition(
			{},
			schemas.users,
		);
		expect(statements.map((s) => s.type)).toStrictEqual(['create_table']);
		expect(actualDdl).toStrictEqual(expectedDdl);
	});

	test('drop_table reproduces target ddl', async () => {
		const { actualDdl, expectedDdl, statements } = await applyTransition(
			schemas.users,
			{},
		);
		expect(statements.map((s) => s.type)).toStrictEqual(['drop_table']);
		expect(actualDdl).toStrictEqual(expectedDdl);
	});

	test('add_column reproduces target ddl', async () => {
		const { actualDdl, expectedDdl, statements } = await applyTransition(
			schemas.users,
			schemas.usersWithEmail,
		);
		expect(statements.map((s) => s.type)).toStrictEqual(['add_column']);
		expect(actualDdl).toStrictEqual(expectedDdl);
	});

	test('drop_column reproduces target ddl', async () => {
		const { actualDdl, expectedDdl, statements } = await applyTransition(
			schemas.usersWithEmail,
			schemas.users,
		);
		expect(statements.map((s) => s.type)).toStrictEqual(['drop_column']);
		expect(actualDdl).toStrictEqual(expectedDdl);
	});

	test('union of independent branches reproduces the merged schema', async () => {
		const parentDDL = drizzleToDDL(schemas.users).ddl;
		const branchADDL = drizzleToDDL(schemas.usersAndLikes).ddl;
		const branchBDDL = drizzleToDDL(schemas.usersAndGroups).ddl;
		const mergedDDL = drizzleToDDL(schemas.usersLikesAndGroups).ddl;

		const { statements: stmtsA } = await ddlDiffDry(parentDDL, branchADDL, 'default');
		const { statements: stmtsB } = await ddlDiffDry(parentDDL, branchBDDL, 'default');
		const combined: JsonStatement[] = [...stmtsA, ...stmtsB];

		const base: SqliteSnapshot = {
			version: '7',
			dialect: 'sqlite',
			id: 'parent-id',
			prevIds: [ORIGIN],
			ddl: parentDDL.entities.list(),
			renames: [],
		};
		const result = generateLatestSnapshot(base, combined);

		expect(stableEntries(result.ddl)).toStrictEqual(
			stableEntries(mergedDDL.entities.list()),
		);
	});
});

/**
 * Reproduces the user-described flow:
 *   1. branch-a generates a migration M_A from parent P (prevIds=[P]).
 *   2. primary branch generates a migration M_P from parent P (prevIds=[P]).
 *   3. branch-a rebases on primary → migrations folder now has M_A and M_P
 *      as siblings under P. M_P's snapshot does not include M_A's changes.
 *
 * Running `drizzle-kit generate` on branch-a after rebase must:
 *   - detect the open commutative branches under P,
 *   - feed (parent=P, statements=A∪P) into prepareSqliteSnapshot, which uses
 *     generateLatestSnapshot to derive the effective prev snapshot,
 *   - yield a merge migration whose prevIds reference both leafs (M_A, M_P).
 */
describe('rebase scenario (sqlite)', () => {
	test('open commutative branches resolve into a merge migration with no diff', async () => {
		const out = mkOut('dk-rebase-sqlite-');

		snapshotPath(out, '0000_parent', makeSnapshot('p1', [ORIGIN], schemas.users));
		snapshotPath(out, '0001_branchA', makeSnapshot('a1', ['p1'], schemas.usersAndLikes));
		snapshotPath(
			out,
			'0001_primary',
			makeSnapshot('pri1', ['p1'], schemas.usersAndGroups),
		);

		const result = await checkHandler(out, 'sqlite', false, false);

		expect(result.parentSnapshot).not.toBeNull();
		expect((result.parentSnapshot as SqliteSnapshot).id).toBe('p1');
		expect(result.leafIds?.sort()).toStrictEqual(['a1', 'pri1']);
		expect(result.nonCommutativityMessage).toBeUndefined();
		const types = result.statements.map((s) => (s as JsonStatement).type).sort();
		expect(types).toStrictEqual(['create_table', 'create_table']);

		const parentSnap = result.parentSnapshot as SqliteSnapshot;
		const effectivePrev = generateLatestSnapshot(
			parentSnap,
			result.statements as JsonStatement[],
		);
		const finalDDL = drizzleToDDL(schemas.usersLikesAndGroups).ddl;

		// Effective prev = parent + (branchA + primary) statements applied.
		// It must already match the post-rebase schema (the user's TS files),
		// so the next ddlDiff against the user schema is empty and the merge
		// migration carries only the prevIds=[a1, pri1] linkage.
		expect(stableEntries(effectivePrev.ddl)).toStrictEqual(
			stableEntries(finalDDL.entities.list()),
		);

		const effectiveDDL = drizzleToDDL({}).ddl;
		for (const e of effectivePrev.ddl) effectiveDDL.entities.push(e);
		const { statements: mergeStatements } = await ddlDiffDry(
			effectiveDDL,
			finalDDL,
			'default',
		);
		expect(mergeStatements).toStrictEqual([]);
	});

	test('rebase with column added in one branch and table added in the other', async () => {
		const out = mkOut('dk-rebase-sqlite-');

		snapshotPath(out, '0000_parent', makeSnapshot('p1', [ORIGIN], schemas.users));
		snapshotPath(out, '0001_branchA', makeSnapshot('a1', ['p1'], schemas.usersWithEmail));
		snapshotPath(
			out,
			'0001_primary',
			makeSnapshot('pri1', ['p1'], schemas.usersAndPosts),
		);

		const result = await checkHandler(out, 'sqlite', false, false);

		expect(result.nonCommutativityMessage).toBeUndefined();
		expect(result.leafIds?.sort()).toStrictEqual(['a1', 'pri1']);
		expect(result.parentSnapshot).not.toBeNull();

		const parentSnap = result.parentSnapshot as SqliteSnapshot;
		const effectivePrev = generateLatestSnapshot(
			parentSnap,
			result.statements as JsonStatement[],
		);

		expect(stableEntries(effectivePrev.ddl)).toStrictEqual(
			stableEntries(drizzleToDDL(schemas.usersWithEmailAndPosts).ddl.entities.list()),
		);
	});

	test('the next migration prevIds points at both open leafs', async () => {
		const out = mkOut('dk-rebase-sqlite-');

		snapshotPath(out, '0000_parent', makeSnapshot('p1', [ORIGIN], schemas.users));
		snapshotPath(out, '0001_branchA', makeSnapshot('a1', ['p1'], schemas.usersAndLikes));
		snapshotPath(
			out,
			'0001_primary',
			makeSnapshot('pri1', ['p1'], schemas.usersAndGroups),
		);

		const result = await checkHandler(out, 'sqlite', false, false);

		expect(result.leafIds).toBeDefined();
		expect(result.leafIds!.length).toBe(2);
		expect(new Set(result.leafIds)).toStrictEqual(new Set(['a1', 'pri1']));
	});

	test('rebase produces a non-commutative report when branches conflict on the same column', async () => {
		const out = mkOut('dk-rebase-sqlite-');

		snapshotPath(out, '0000_parent', makeSnapshot('p1', [ORIGIN], schemas.usersEmailWithText));
		snapshotPath(out, '0001_branchA', makeSnapshot('a1', ['p1'], schemas.usersEmailNotNull));
		snapshotPath(out, '0001_primary', makeSnapshot('pri1', ['p1'], schemas.usersEmailAsInt));

		const result = await checkHandler(out, 'sqlite', false, false);

		expect(result.statements).toStrictEqual([]);
		expect(result.nonCommutativityMessage).toContain(
			'Non-commutative migrations detected',
		);
		expect(result.nonCommutativityMessage).toContain('users');
	});
});
