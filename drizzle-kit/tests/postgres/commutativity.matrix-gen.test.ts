import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { drySnapshot } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { expect, test } from 'vitest';
import { build } from './commutativity-statements';

// The committed matrix must match the rules in buildFacetPaths.
// Rewrite it after a rule change:
//   UPDATE_MATRIX=1 pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts
// Build the visualizer page from the committed matrix:
//   MATRIX_HTML=<out.html> pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts
const matrixPath = join(import.meta.dirname, 'commutativity-matrix.json');
const templatePath = join(import.meta.dirname, 'commutativity-matrix.template.html');
const placeholder = '__MATRIX_DATA__';

const TYPES = [
	'create_table',
	'drop_table',
	'rename_table',
	'move_table',
	'add_column',
	'drop_column',
	'alter_column',
	'recreate_column',
	'rename_column',
	'create_index',
	'drop_index',
	'rename_index',
	'recreate_index',
	'add_pk',
	'drop_pk',
	'alter_pk',
	'create_fk',
	'drop_fk',
	'recreate_fk',
	'add_unique',
	'drop_unique',
	'alter_unique',
	'add_check',
	'drop_check',
	'alter_check',
	'rename_constraint',
	'create_enum',
	'drop_enum',
	'rename_enum',
	'alter_enum',
	'recreate_enum',
	'move_enum',
	'alter_type_drop_value',
	'create_schema',
	'drop_schema',
	'rename_schema',
	'create_sequence',
	'drop_sequence',
	'rename_sequence',
	'alter_sequence',
	'move_sequence',
	'create_view',
	'drop_view',
	'rename_view',
	'alter_view',
	'move_view',
	'create_policy',
	'drop_policy',
	'rename_policy',
	'alter_policy',
	'recreate_policy',
	'alter_rls',
	'create_role',
	'drop_role',
	'rename_role',
	'alter_role',
	'grant_privilege',
	'revoke_privilege',
	'regrant_privilege',
];

const FAMILY: Record<string, string> = {};
for (const t of TYPES) {
	FAMILY[t] = t.includes('table')
		? 'table'
		: t.includes('column')
		? 'column'
		: t.includes('index')
		? 'index'
		: t.includes('_pk')
		? 'pk'
		: t.includes('_fk')
		? 'fk'
		: t.includes('unique')
		? 'unique'
		: t.includes('check')
		? 'check'
		: t === 'rename_constraint'
		? 'constraint'
		: (t.includes('enum') || t === 'alter_type_drop_value')
		? 'enum'
		: t.includes('sequence')
		? 'sequence'
		: t.includes('view')
		? 'view'
		: t.includes('schema')
		? 'schema'
		: t.includes('policy')
		? 'policy'
		: t.includes('rls')
		? 'rls'
		: t.includes('role')
		? 'role'
		: t.includes('privilege')
		? 'privilege'
		: 'other';
}

const KINDNAME: Record<string, string> = {
	sch: 'schema',
	tbl: 'table',
	col: 'column',
	idx: 'index',
	pk: 'primary key of',
	uq: 'unique constraint',
	ck: 'check constraint',
	fk: 'foreign key',
	pol: 'policy',
	rls: 'row-level security on',
	enum: 'enum',
	seq: 'sequence',
	view: 'view',
	role: 'role',
	priv: 'privileges on',
};
const pretty = (k: string): string => {
	const [, kind, path] = k.split('|');
	return `${KINDNAME[kind] ?? kind} ${path}`;
};
// how a statement that WRITES a resource affects it (for the reason sentence)
const verb = (type: string): string =>
	type.startsWith('rename')
		? 'renames'
		: type.startsWith('move')
		? 'moves'
		: type.startsWith('drop')
		? 'drops'
		: (type.startsWith('create') || type.startsWith('add'))
		? 'creates'
		: 'changes';

function facetSets(stmt: JsonStatement) {
	const { owns = [], destroys = [], needs = [] } = (postgresCommutativity as any).buildFacetPaths(stmt);
	return { writes: new Set<string>([...owns, ...destroys]), reads: new Set<string>(needs) };
}

// A create cannot share a base with a statement that needs the created node to
// exist already. The matrix marks such pairs impossible. The rules still report
// them as conflicts.
const CREATE_OPS = new Set([
	'create_table',
	'create_schema',
	'create_enum',
	'create_sequence',
	'create_view',
	'create_role',
	'add_column',
	'add_pk',
	'add_unique',
	'add_check',
	'create_fk',
	'create_index',
	'create_policy',
	'grant_privilege',
]);

async function conflict(a: JsonStatement, b: JsonStatement): Promise<boolean> {
	return !!(await postgresCommutativity.getReasonsFromStatements([a], [b], drySnapshot));
}

async function generateMatrix() {
	const stmts = TYPES.map(build);
	const sets = stmts.map(facetSets);

	const matrix: number[][] = [];
	const impossible: number[][] = [];
	const reasons: Record<string, string[]> = {};

	const creates = (i: number) => (CREATE_OPS.has(TYPES[i]) ? [...sets[i].writes] : []);
	const assumesExists = (i: number) => {
		const s = new Set(sets[i].reads);
		if (!CREATE_OPS.has(TYPES[i])) { for (const k of sets[i].writes) s.add(k); }
		return s;
	};
	const impossibleWhy = (i: number, j: number): string | null => {
		for (const k of creates(i)) {
			if (assumesExists(j).has(k)) {
				return `<b>${TYPES[i]}</b> creates <code>${pretty(k)}</code>, which <b>${
					TYPES[j]
				}</b> assumes already exists — so they can't come from a shared base.`;
			}
		}
		for (const k of creates(j)) {
			if (assumesExists(i).has(k)) {
				return `<b>${TYPES[j]}</b> creates <code>${pretty(k)}</code>, which <b>${
					TYPES[i]
				}</b> assumes already exists — so they can't come from a shared base.`;
			}
		}
		return null;
	};

	// One sentence per shared node. A node can appear in several facets, so repeated sentences are removed.
	const why = (i: number, j: number): string[] => {
		const A = sets[i], B = sets[j], out: string[] = [], seen = new Set<string>();
		for (const k of new Set([...A.writes, ...B.writes])) {
			const res = `<code>${pretty(k)}</code>`;
			const aw = A.writes.has(k), bw = B.writes.has(k), ar = A.reads.has(k), br = B.reads.has(k);
			let sentence: string | null = null;
			if (aw && bw) sentence = `<b>${TYPES[i]}</b> and <b>${TYPES[j]}</b> both change ${res}`;
			else if (aw && br) sentence = `<b>${TYPES[i]}</b> ${verb(TYPES[i])} ${res}, which <b>${TYPES[j]}</b> references`;
			else if (bw && ar) sentence = `<b>${TYPES[j]}</b> ${verb(TYPES[j])} ${res}, which <b>${TYPES[i]}</b> references`;
			if (sentence && !seen.has(sentence)) {
				seen.add(sentence);
				out.push(sentence);
			}
		}
		return out;
	};

	for (let i = 0; i < TYPES.length; i++) {
		const row: number[] = [];
		const irow: number[] = [];
		for (let j = 0; j < TYPES.length; j++) {
			const c = await conflict(stmts[i], stmts[j]);
			row.push(c ? 1 : 0);
			let imp = 0;
			if (c && i !== j) {
				const impWhy = impossibleWhy(i, j);
				if (impWhy) {
					imp = 1;
					reasons[`${i},${j}`] = [impWhy];
				} else reasons[`${i},${j}`] = why(i, j);
			}
			irow.push(imp);
		}
		matrix.push(row);
		impossible.push(irow);
	}

	const conflictsCount = matrix.flat().filter(Boolean).length;
	const impossibleCount = impossible.flat().filter(Boolean).length;
	return { types: TYPES, family: FAMILY, matrix, impossible, reasons, conflictsCount, impossibleCount };
}

test('committed matrix matches the rules', async () => {
	const fresh = await generateMatrix();
	// Tab-indented JSON is also the layout that dprint keeps.
	if (process.env.UPDATE_MATRIX) writeFileSync(matrixPath, JSON.stringify(fresh, null, '\t') + '\n');

	const committed = JSON.parse(readFileSync(matrixPath, 'utf8'));
	expect(
		fresh,
		'The commutativity rules changed. Review the matrix diff, then rewrite commutativity-matrix.json with '
			+ 'UPDATE_MATRIX=1 pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts',
	).toEqual(committed);
});

test('visualizer page builds from the committed matrix', () => {
	const template = readFileSync(templatePath, 'utf8');
	expect(template.split(placeholder)).toHaveLength(2);

	const data = readFileSync(matrixPath, 'utf8').trim();
	const page = template.replace(placeholder, () => data);
	expect(page).not.toContain(placeholder);
	if (process.env.MATRIX_HTML) writeFileSync(process.env.MATRIX_HTML, page);
});
