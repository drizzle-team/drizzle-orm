// Property tests over random schemas, rename decisions and migration histories. Each property checks
// the same cases on every run: case n uses seed 20260928 + n. FUZZ_SEED sets another first seed, and
// FUZZ_SEED=random picks one at random. FUZZ_RUNS sets the number of cases for each property:
//   FUZZ_SEED=random FUZZ_RUNS=300 pnpm vitest run tests/postgres/fuzz.test.ts
// A failure prints the seed of the failing case and the smallest case that still fails.
import { randomUUID } from 'crypto';
import { foreignKey, integer, pgSchema, pgTable } from 'drizzle-orm/pg-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { prepareSnapshotFolderName } from 'src/cli/commands/generate-common';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { apply, applyInPlace, create } from 'src/dialects/dialect';
import { createDDL, fromEntities, type PostgresDDL } from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { type PostgresSnapshotV8, reconstruct } from 'src/dialects/postgres/snapshot';
import { withStateKeyNames } from 'src/dialects/postgres/versions-v9';
import { originUUID } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { expect, test } from 'vitest';
import { createFolderFlow, schemaState, tempDir } from './folder-flow';
import {
	applyOps,
	checkProperty,
	createIds,
	emptyModel,
	generateHistory,
	generateOps,
	type Op,
	type Random,
	renameDecisions,
	replayHistory,
	runHistory,
	shrinkHistory,
	type Step,
	toDDL,
	toRenameString,
	toSchema,
	withoutOne,
} from './fuzz';
import { diff, drizzleToDDL, type PostgresSchema } from './mocks';

type Pair = { before: Op[]; after: Op[] };

const generatePair = (random: Random): Pair => {
	const nextId = createIds();
	const empty = emptyModel();
	const { ops: before, model } = generateOps(random, nextId, [empty], empty, 10 + random.int(15));
	const { ops: after } = generateOps(random, nextId, [model], model, 2 + random.int(7));
	return { before, after };
};

const shrinkPair = ({ before, after }: Pair): Pair[] => [
	...withoutOne(after).map((ops) => ({ before, after: ops })),
	...withoutOne(before).map((ops) => ({ before: ops, after })),
];

// The two states of a pair and the rename decisions between them, in the mockResolver format.
const statesOf = ({ before, after }: Pair) => {
	const from = applyOps(emptyModel(), before);
	const to = applyOps(from, after);
	return { left: toDDL(from)!, right: toDDL(to)!, renames: renameDecisions(from, to, after).map(toRenameString) };
};

const renameResolvers = (renames: string[]) => {
	const resolver = () => mockResolver<any>(new Set(renames));
	return [
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
		resolver(),
	] as const;
};

const stateOf = (ddl: PostgresDDL) => normalizeDDL(ddl.entities.list());

test('replaying the deltas of ddlDiff rebuilds the new state', async () => {
	await checkProperty({
		runs: 300,
		generate: generatePair,
		shrink: shrinkPair,
		check: async (pair) => {
			const { left, right, renames } = statesOf(pair);
			// The helper replays the deltas on a copy of `left` and throws when the result differs from `right`.
			await diff(left, right, renames);
		},
	});
});

test('a replay on a store without reference edges gives the same state', async () => {
	const { defs, identity } = createDDL()._;
	await checkProperty({
		runs: 300,
		generate: generatePair,
		shrink: shrinkPair,
		check: async (pair) => {
			const { left, right, renames } = statesOf(pair);
			const bare = create(defs, { identity }) as unknown as PostgresDDL;
			bare.entities.pushAll(left.entities.list());
			const parent = apply(left, []);
			const { deltas } = await ddlDiff(left, right, ...renameResolvers(renames), 'default');
			expect(stateOf(applyInPlace(bare, deltas))).toStrictEqual(stateOf(apply(parent, deltas)));
		},
	});
});

const historyProperty = (runs: number, check: (steps: Step[]) => Promise<void>) =>
	checkProperty({
		runs,
		generate: (random) => generateHistory(random, 8 + random.int(8)),
		shrink: shrinkHistory,
		check,
	});

test('the stored statements of each migration rebuild its SQL file', async () => {
	await historyProperty(40, async (steps) => {
		const { flow, written } = await runHistory(steps);
		for (const [folder, { branch, isCustom }] of written) {
			// A later generate --fix-conflicts can delete the folder.
			if (!flow.folders(branch).includes(folder)) continue;
			if (isCustom) expect(flow.statements(branch, folder), `the statements of ${folder}`).toStrictEqual([]);
			else expect(flow.statementsSql(branch, folder), `the statements of ${folder}`).toBe(flow.sql(branch, folder));
		}
	});
});

// When a table or column is renamed, Postgres keeps the generated names of its constraints, and so does the
// state. The schema derives new names from the new table and column names, so the comparison ignores them.
const withoutGeneratedNames = (state: string[]) =>
	normalizeDDL(state.map((it) => JSON.parse(it)).map((it) => (it.nameExplicit === false ? { ...it, name: '' } : it)));

test('every snapshot of a history with forks and merges rebuilds to its schema, and combined states repeat', async () => {
	await historyProperty(40, async (steps) => {
		const { flow, branches, written } = await runHistory(steps);
		const combined = new Map<string, string[]>();
		for (const branch of branches) {
			for (const folder of flow.folders(branch)) {
				const expected = schemaState(toSchema(written.get(folder)!.model));
				expect(withoutGeneratedNames(flow.state(branch, folder)), `the state of ${folder} on branch ${branch}`)
					.toStrictEqual(withoutGeneratedNames(expected));
			}
			for (const folder of flow.folders(branch)) {
				if (flow.snapshot(branch, folder).prevIds.length < 2) continue;
				const state = flow.combinedState(branch, folder);
				expect(flow.combinedState(branch, folder), `the combined state of ${folder}`).toStrictEqual(state);
				// Another branch folder has other snapshots next to the merge history, which must not change it.
				expect(state, `the combined state of ${folder} on branch ${branch}`).toStrictEqual(
					combined.get(folder) ?? state,
				);
				combined.set(folder, state);
			}
		}
	});
});

// Writes the folder that drizzle-kit 1.0.0-rc.4 wrote for the history: the full state after ddlDiff, the
// rename strings and every leaf as a parent. All branches share one folder. A merge starts from its newest
// leaf, as rc.4 did with --ignore-conflicts.
const writeFormat8Folder = async (steps: Step[], dir: string) => {
	const folders = new Map<string, string[]>([['main', []]]);
	const snapshots = new Map<string, PostgresSnapshotV8>();
	let time = Date.UTC(2026, 0, 1, 12, 0, 0);
	await replayHistory(steps, async (step, start, next, sources) => {
		if (step.type === 'fork') {
			folders.set(step.branch, [...folders.get(step.from)!]);
			return;
		}
		const own = [...new Set([step.branch, ...sources].flatMap((it) => folders.get(it)!))].sort();
		folders.set(step.branch, own);
		const parents = new Set(own.flatMap((it) => snapshots.get(it)!.prevIds));
		const leaves = own.filter((it) => !parents.has(snapshots.get(it)!.id));
		const latest = snapshots.get(leaves.at(-1)!);
		const prevIds = leaves.length ? leaves.map((it) => snapshots.get(it)!.id) : [originUUID];
		let snapshot: PostgresSnapshotV8;
		if (step.type === 'custom') {
			if (!latest) return;
			snapshot = { ...latest, id: randomUUID(), prevIds, renames: [] };
		} else {
			const to = toDDL(next)!;
			const renames = renameDecisions(start, next, step.ops).map(toRenameString);
			const from = fromEntities(structuredClone(latest?.ddl ?? []));
			const result = await ddlDiff(from, to, ...renameResolvers(renames), 'default');
			if (result.sqlStatements.length === 0) return;
			snapshot = {
				version: '8',
				dialect: 'postgres',
				id: randomUUID(),
				prevIds,
				ddl: to.entities.list(),
				renames: result.renames,
			};
		}
		time += 1000;
		const folder = `${prepareSnapshotFolderName(time)}_${step.branch}`;
		snapshots.set(folder, snapshot);
		own.push(folder);
		mkdirSync(join(dir, folder));
		writeFileSync(join(dir, folder, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
		writeFileSync(join(dir, folder, 'migration.sql'), '');
	});
	return snapshots;
};

test('up rebuilds every state of a format 8 folder', async () => {
	await historyProperty(40, async (steps) => {
		const dir = tempDir('dk-fuzz-format-8-');
		const originals = await writeFormat8Folder(steps, dir);
		const flow = createFolderFlow();
		flow.seed('main', dir);
		await flow.up('main');
		for (const [folder, original] of originals) {
			const state = reconstruct(flow.history('main'), flow.snapshot('main', folder).id);
			expect(flow.state('main', folder), `the state of ${folder}`).toStrictEqual(
				normalizeDDL(fromEntities(withStateKeyNames(original.ddl, state)).entities.list()),
			);
		}
	});
});

test('up keeps a generated constraint name that a format 8 merge got from its newest leaf', async () => {
	const dir = tempDir('dk-fuzz-format-8-');
	const users = pgTable('users', { id: integer().notNull() });
	const withKey = (name: string) =>
		pgTable(name, { id: integer().notNull() }, (t) => [foreignKey({ columns: [t.id], foreignColumns: [t.id] })]);
	const archive = pgSchema('archive');
	const rowsOf = (schema: PostgresSchema) => drizzleToDDL(schema).ddl.entities.list();
	// rc.4 diffed this merge from leaf b, which has no foreign key, so the key got the name of the renamed
	// table. The combined state has the key from leaf a, with the name of the old table.
	const merge = rowsOf({ people: withKey('people'), archive });
	const files = [
		{ folder: '20260101120001_main', id: 'main', prevIds: [originUUID], ddl: rowsOf({ users }) },
		{ folder: '20260101120002_a', id: 'a', prevIds: ['main'], ddl: rowsOf({ users: withKey('users') }) },
		{ folder: '20260101120003_b', id: 'b', prevIds: ['main'], ddl: rowsOf({ users, archive }) },
		{
			folder: '20260101120004_merge',
			id: 'merge',
			prevIds: ['a', 'b'],
			ddl: merge,
			renames: ['public.users->public.people'],
		},
	];
	for (const { folder, renames = [], ...it } of files) {
		mkdirSync(join(dir, folder));
		writeFileSync(
			join(dir, folder, 'snapshot.json'),
			JSON.stringify({ version: '8', dialect: 'postgres', ...it, renames }),
		);
	}
	const flow = createFolderFlow();
	flow.seed('main', dir);

	await flow.up('main');

	const state = flow.state('main', '20260101120004_merge');
	expect(state).toStrictEqual(normalizeDDL(merge));
	expect(state.filter((it) => it.includes('"fks"')).map((it) => JSON.parse(it).name)).toStrictEqual([
		'people_id_people_id_fkey',
	]);
});
