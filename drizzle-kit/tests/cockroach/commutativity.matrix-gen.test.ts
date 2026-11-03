import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { cockroachCommutativity } from 'src/dialects/cockroach/commutativity';
import type { JsonStatement } from 'src/dialects/cockroach/statements';
import { expect, test } from 'vitest';
import { footprintsOfStatements, rows } from './commutativity-catalog';

// Keeps the committed `cockroach-commutativity-matrix.json` equal to the verdicts of the footprint rules for
// every pair of statements in `commutativity-catalog.ts`. Rewrite the file after a rule change:
//   UPDATE_MATRIX=1 pnpm vitest run tests/cockroach/commutativity.matrix-gen.test.ts
const matrixPath = join(import.meta.dirname, 'cockroach-commutativity-matrix.json');

const catalog = rows();
const TYPES = Object.keys(catalog);

function nodeSets(statement: JsonStatement) {
	const [{ writes, reads = [], sharedWrites = [] }] = footprintsOfStatements([statement]);
	return { writes: new Set(writes), reads: new Set(reads), sharedWrites: new Set(sharedWrites) };
}

function conflict(a: JsonStatement, b: JsonStatement): boolean {
	return !!cockroachCommutativity.findConflict(footprintsOfStatements([a]), footprintsOfStatements([b]));
}

function generateMatrix() {
	const statements = TYPES.map((type) => catalog[type].statement);
	const sets = statements.map(nodeSets);

	// `matrix` and `impossible` hold one string of 0 and 1 for each row. A pair is impossible when one statement
	// creates an object that the other statement needs to exist already, so the two cannot come from one fork.
	const matrix: string[] = [];
	const impossible: string[] = [];

	const isCreate = (i: number) => !!catalog[TYPES[i]].isCreate;
	const creates = (i: number) => (isCreate(i) ? [...sets[i].writes] : []);
	const assumesExists = (i: number) => {
		const s = new Set(sets[i].reads);
		if (!isCreate(i)) { for (const k of sets[i].writes) s.add(k); }
		return s;
	};
	const impossibleWhy = (i: number, j: number): boolean => {
		for (const k of creates(i)) if (assumesExists(j).has(k)) return true;
		for (const k of creates(j)) if (assumesExists(i).has(k)) return true;
		return false;
	};

	for (let i = 0; i < TYPES.length; i++) {
		const row: number[] = [];
		const irow: number[] = [];
		for (let j = 0; j < TYPES.length; j++) {
			const value = conflict(statements[i], statements[j]);
			row.push(value ? 1 : 0);
			irow.push(value && i !== j && impossibleWhy(i, j) ? 1 : 0);
		}
		matrix.push(row.join(''));
		impossible.push(irow.join(''));
	}

	return { types: TYPES, matrix, impossible };
}

test('committed matrix matches the rules', () => {
	const fresh = generateMatrix();
	// The tab indent matches the layout that dprint keeps, so a formatter run does not change the file.
	if (process.env.UPDATE_MATRIX) writeFileSync(matrixPath, JSON.stringify(fresh, null, '\t') + '\n');

	const committed = JSON.parse(readFileSync(matrixPath, 'utf8'));
	expect(
		fresh,
		'The commutativity rules changed. Review the matrix diff, then rewrite cockroach-commutativity-matrix.json '
			+ 'with UPDATE_MATRIX=1 pnpm vitest run tests/cockroach/commutativity.matrix-gen.test.ts',
	).toEqual(committed);
});

test('the catalog has a row for every statement type of the union that the diff can write', async () => {
	// A statement type that the diff writes must have a row, because the matrix would otherwise miss a conflict
	// that a real folder can produce. The three types in `withoutConvertor` are not written by the diff.
	const { diff } = await import('./mocks');
	const { sql } = await import('drizzle-orm');
	const { check, cockroachTable, index, int4, text } = await import('drizzle-orm/cockroach-core');

	const users = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name') }, (t) => [
		index('ix').on(t.name),
		check('ck', sql`${t.name} <> ''`),
	]);
	const changed = cockroachTable('users', { id: int4('id').primaryKey(), name: text('name2') }, (t) => [
		index('ix2').on(t.name),
	]);
	const { statements } = await diff({ users }, { users: changed }, ['public.users.name->public.users.name2']);

	const seen = new Set<string>();
	for (const statement of statements) {
		seen.add(statement.type === 'rename_constraint' ? `rename_constraint:${statement.entityType}` : statement.type);
	}
	expect([...seen].filter((type) => !TYPES.includes(type))).toStrictEqual([]);
});
