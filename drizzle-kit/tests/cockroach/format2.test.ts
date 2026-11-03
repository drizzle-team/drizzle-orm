import { cockroachTable, int4, text } from 'drizzle-orm/cockroach-core';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { handle } from 'src/cli/commands/generate-cockroach';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { runCheck } from 'src/cli/schema';
import { readFolder, stateOf } from 'src/dialects/cockroach/folder';
import type { CockroachSnapshot } from 'src/dialects/cockroach/snapshot';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { expect, onTestFinished, test, vi } from 'vitest';
import { type CockroachDBSchema, drizzleToDDL } from './mocks';

const tempDir = () => {
	const dir = mkdtempSync(join('tests/cockroach/tmp', 'format2-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

let clock = Date.UTC(2026, 0, 1, 12, 0, 0);

const schemaFile = (body: string) =>
	`import { cockroachTable, int4, text } from 'drizzle-orm/cockroach-core';\n${body}\n`;

const generate = async (out: string, body: string, custom = false) => {
	const schemaPath = join(out, `schema-${Math.random().toString(36).slice(2)}.ts`);
	writeFileSync(schemaPath, schemaFile(body));
	clock += 1000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(clock);
	try {
		return await runWithCliContext({ output: 'json', interactive: false }, () =>
			handle({
				dialect: 'cockroach',
				filenames: [schemaPath],
				schemaSource: undefined as never,
				out,
				breakpoints: true,
				name: 'test',
				custom,
				bundle: false,
				explain: false,
				hints: new HintsHandler(),
			}));
	} finally {
		vi.useRealTimers();
	}
};

const folders = (out: string) => readdirSync(out).filter((it) => !it.endsWith('.ts')).sort();
const snapshot = (out: string, folder: string): CockroachSnapshot =>
	JSON.parse(readFileSync(join(out, folder, 'snapshot.json'), 'utf8'));
const schemaState = (schema: CockroachDBSchema) => normalizeDDL(drizzleToDDL(schema).ddl.entities.list());

const firstSource =
	`export const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name') });`;
const secondSource =
	`export const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name'), email: text('email') });`;

const firstSchema: CockroachDBSchema = {
	users: cockroachTable('users', { id: int4('id').primaryKey(), name: text('name') }),
};
const secondSchema: CockroachDBSchema = {
	users: cockroachTable('users', { id: int4('id').primaryKey(), name: text('name'), email: text('email') }),
};

test('generate writes a base snapshot and then a diff snapshot', async () => {
	const out = tempDir();

	await generate(out, firstSource);
	await generate(out, secondSource);

	const [firstFolder, secondFolder] = folders(out);
	const base = snapshot(out, firstFolder);
	const diff = snapshot(out, secondFolder);
	expect(base.type).toBe('base');
	expect(diff.type).toBe('diff');
	if (base.type !== 'base' || diff.type !== 'diff') throw new Error('wrong snapshot types');
	expect(base.ddl.length).toBeGreaterThan(0);
	expect(diff.deltas.length).toBeGreaterThan(0);
	expect(diff.footprints).toHaveLength(diff.deltas.length);
	expect(diff).not.toHaveProperty('ddl');

	const stored = readFolder(out);
	expect(normalizeDDL(stateOf(stored, base.id).entities.list()), firstFolder).toStrictEqual(schemaState(firstSchema));
	expect(normalizeDDL(stateOf(stored, diff.id).entities.list()), secondFolder).toStrictEqual(
		schemaState(secondSchema),
	);
});

test('a custom migration stores no footprints', async () => {
	const out = tempDir();

	await generate(out, firstSource);
	await generate(out, firstSource, true);

	const [, customFolder] = folders(out);
	const custom = snapshot(out, customFolder);
	expect(custom.type).toBe('diff');
	if (custom.type !== 'diff') throw new Error('wrong snapshot type');
	expect(custom.footprints).toStrictEqual([]);
	expect(custom.deltas).toStrictEqual([]);
});

test('a fork writes one merge snapshot with every leaf as a parent', async () => {
	const root = tempDir();
	const main = join(root, 'main');
	const branchA = join(root, 'a');
	const branchB = join(root, 'b');
	mkdirSync(main);
	mkdirSync(branchA);
	mkdirSync(branchB);

	await generate(main, firstSource);
	cpSync(main, branchA, { recursive: true });
	cpSync(main, branchB, { recursive: true });

	const withA =
		`export const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name'), a: text('a') });`;
	const withB =
		`export const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name'), b: text('b') });`;
	await generate(branchA, withA);
	await generate(branchB, withB);

	cpSync(branchA, main, { recursive: true });
	cpSync(branchB, main, { recursive: true });

	const both =
		`export const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name'), a: text('a'), b: text('b'), c: text('c') });`;
	await generate(main, both);

	const all = folders(main);
	const mergeFolder = all[all.length - 1];
	const merge = snapshot(main, mergeFolder);
	expect(merge.type).toBe('diff');
	if (merge.type !== 'diff') throw new Error('wrong snapshot type');
	expect(merge.prevIds).toHaveLength(2);
	expect(merge.prevIds[0]).toBe(snapshot(main, all[all.length - 2]).id);

	const stored = readFolder(main);
	const expected: CockroachDBSchema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
			a: text('a'),
			b: text('b'),
			c: text('c'),
		}),
	};
	expect(normalizeDDL(stateOf(stored, merge.id).entities.list())).toStrictEqual(schemaState(expected));
});

test('check warns when the schema differs from the migrations', async () => {
	const out = tempDir();
	await generate(out, firstSource);

	const schemaPath = join(out, 'changed.ts');
	writeFileSync(
		schemaPath,
		schemaFile(
			`export const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name'), email: text('email') });`,
		),
	);

	const result = await runWithCliContext({ output: 'json', interactive: false }, () =>
		runCheck({
			out,
			dialect: 'cockroach',
			schema: schemaPath,
			ignoreConflicts: false,
			output: 'json',
		}));

	expect(result.warnings?.[0]?.kind).toBe('schema_changed');
});
