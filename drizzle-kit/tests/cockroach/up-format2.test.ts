import { cockroachTable, int4, text } from 'drizzle-orm/cockroach-core';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { handle } from 'src/cli/commands/generate-cockroach';
import { upCockroachHandler } from 'src/cli/commands/up-cockroach';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { readFolder, stateOf } from 'src/dialects/cockroach/folder';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { expect, onTestFinished, test, vi } from 'vitest';
import type { CockroachDBSchema } from './mocks';
import { drizzleToDDL } from './mocks';

const tempDir = () => {
	const dir = mkdtempSync(join('tests/cockroach/tmp', 'up-format2-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

let clock = Date.UTC(2026, 0, 1, 12, 0, 0);

const schemaFile = (body: string) =>
	`import { cockroachTable, int4, text } from 'drizzle-orm/cockroach-core';\n${body}\n`;

const generate = async (out: string, body: string) => {
	const schemaPath = join(out, `schema-${Math.random().toString(36).slice(2)}.ts`);
	writeFileSync(schemaPath, schemaFile(body));
	clock += 1000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(clock);
	try {
		await runWithCliContext({ output: 'json', interactive: false }, () =>
			handle({
				dialect: 'cockroach',
				filenames: [schemaPath],
				schemaSource: undefined as never,
				out,
				breakpoints: true,
				name: 'test',
				custom: false,
				bundle: false,
				explain: false,
				hints: new HintsHandler(),
			}));
	} finally {
		vi.useRealTimers();
	}
};

const folders = (out: string) => readdirSync(out).filter((it) => !it.endsWith('.ts')).sort();

// Rewrites every snapshot of a format 2 folder as a format 1 snapshot, which stores the full state and the
// rename strings of its migration.
const toFormat1 = (out: string) => {
	const stored = readFolder(out);
	const states = new Map([...stored.snapshots.keys()].map((id) => [id, stateOf(stored, id)]));
	for (const file of stored.files) {
		writeFileSync(
			file.path,
			JSON.stringify(
				{
					version: '1',
					dialect: 'cockroach',
					id: file.snapshot.id,
					prevIds: file.snapshot.prevIds,
					ddl: states.get(file.snapshot.id)!.entities.list(),
					renames: [],
				},
				null,
				2,
			),
		);
	}
	return states;
};

const stateOfFolder = (out: string) => {
	const stored = readFolder(out);
	return new Map([...stored.snapshots.keys()].map((id) => [id, normalizeDDL(stateOf(stored, id).entities.list())]));
};

const expected = (schema: CockroachDBSchema) => normalizeDDL(drizzleToDDL(schema).ddl.entities.list());

const users = (extra: string) =>
	`export const users = cockroachTable('users', { id: int4('id').primaryKey()${extra} });`;

test('up converts a folder of several migrations and keeps every state', async () => {
	const out = tempDir();
	await generate(out, users(`, name: text('name')`));
	await generate(out, users(`, name: text('name'), email: text('email')`));

	const before = toFormat1(out);
	await upCockroachHandler(out);

	const after = stateOfFolder(out);
	for (const [id, state] of before) {
		expect(after.get(id), id).toStrictEqual(normalizeDDL(state.entities.list()));
	}
	const stored = readFolder(out);
	expect(stored.files.map((it) => it.snapshot.version)).toStrictEqual(['2', '2']);
});

test('up converts a fork and keeps the state of the merge', async () => {
	const root = tempDir();
	const main = join(root, 'main');
	const a = join(root, 'a');
	const b = join(root, 'b');
	mkdirSync(main);
	mkdirSync(a);
	mkdirSync(b);

	await generate(main, users(''));
	cpSync(main, a, { recursive: true });
	cpSync(main, b, { recursive: true });
	await generate(a, users(`, a: text('a')`));
	await generate(b, users(`, b: text('b')`));
	cpSync(a, main, { recursive: true });
	cpSync(b, main, { recursive: true });
	await generate(main, users(`, a: text('a'), b: text('b'), c: text('c')`));

	const before = toFormat1(main);
	await upCockroachHandler(main);

	const after = stateOfFolder(main);
	for (const [id, state] of before) {
		expect(after.get(id), id).toStrictEqual(normalizeDDL(state.entities.list()));
	}
});

test('up refuses a damaged folder and changes no file', async () => {
	const out = tempDir();
	await generate(out, users(''));
	await generate(out, users(`, name: text('name')`));
	toFormat1(out);

	const [first] = folders(out);
	const filesBefore = folders(out).map((folder) => [folder, readFileSync(join(out, folder, 'snapshot.json'), 'utf8')]);

	// Delete the first migration, so the second one follows a snapshot that the folder does not hold.
	rmSync(join(out, first), { recursive: true });

	await expect(runWithCliContext({ output: 'json', interactive: false }, () => upCockroachHandler(out))).rejects
		.toThrow(
			/a migration was deleted in the middle of the history/,
		);

	for (const [folder, text] of filesBefore.slice(1)) {
		expect(readFileSync(join(out, folder, 'snapshot.json'), 'utf8'), folder).toBe(text);
	}
});
