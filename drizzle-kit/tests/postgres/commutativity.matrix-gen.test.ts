import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	unique,
	varchar,
} from 'drizzle-orm/pg-core';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { expect, test } from 'vitest';
import { build } from './commutativity-statements';
import { diff } from './mocks';

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
	'create_table:enum',
	'drop_table',
	'rename_table',
	'move_table',
	'add_column',
	'add_column:enum',
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
	'rename_constraint:pks',
	'rename_constraint:uniques',
	'rename_constraint:checks',
	'rename_constraint:fks',
	'create_enum',
	'drop_enum',
	'rename_enum',
	'alter_enum',
	'recreate_enum',
	'recreate_enum:column',
	'move_enum',
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
// A row name is a statement type, or a type and a variant after a colon.
const typeOf = (row: string) => row.split(':')[0];
for (const row of TYPES) {
	const t = typeOf(row);
	FAMILY[row] = t.includes('table')
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
		: t.includes('enum')
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
	return !!(await postgresCommutativity.getReasonsFromStatements([a], [b]));
}

async function generateMatrix() {
	const stmts = TYPES.map(build);
	const sets = stmts.map(facetSets);

	const matrix: number[][] = [];
	const impossible: number[][] = [];
	const reasons: Record<string, string[]> = {};

	const isCreate = (i: number) => CREATE_OPS.has(typeOf(TYPES[i]));
	const creates = (i: number) => (isCreate(i) ? [...sets[i].writes] : []);
	const assumesExists = (i: number) => {
		const s = new Set(sets[i].reads);
		if (!isCreate(i)) { for (const k of sets[i].writes) s.add(k); }
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

// A schema with one entity of every kind that the diff can rename or move. `renamed` gives the names
// after one rename, and `hint` is the rename decision for it.
type Names = Partial<{
	schema: string;
	table: string;
	postsSchema: string;
	column: string;
	index: string;
	pk: string;
	unique: string;
	fk: string;
	check: string;
	enum: string;
	enumSchema: string;
	sequence: string;
	sequenceSchema: string;
	view: string;
	viewSchema: string;
	policy: string;
	role: string;
}>;
const schemaWith = (n: Names = {}) => {
	const archive = pgSchema(n.schema ?? 'archive');
	const mood = n.enumSchema ? archive.enum(n.enum ?? 'mood', ['a', 'b']) : pgEnum(n.enum ?? 'mood', ['a', 'b']);
	const role = pgRole(n.role ?? 'r');
	const users = pgTable(n.table ?? 'users', {
		id: integer().notNull(),
		email: varchar(n.column ?? 'email'),
		n: integer(),
		m: mood(),
	}, (t) => [
		primaryKey({ name: n.pk ?? 'users_pk', columns: [t.id] }),
		unique(n.unique ?? 'users_email_uq').on(t.email),
		index(n.index ?? 'users_email_ix').on(t.email),
		check(n.check ?? 'users_n_ck', sql`${t.n} > 0`),
		pgPolicy(n.policy ?? 'users_pol', { for: 'select', to: role, using: sql`true` }),
	]);
	const postsColumns = { id: integer(), userId: integer('user_id') };
	const postsConstraints = (t: any) => [
		foreignKey({ name: n.fk ?? 'posts_user_fk', columns: [t.userId], foreignColumns: [users.id] }),
	];
	const posts = n.postsSchema
		? archive.table('posts', postsColumns, postsConstraints)
		: pgTable('posts', postsColumns, postsConstraints);
	const sequence = n.sequenceSchema ? archive.sequence(n.sequence ?? 'seq') : pgSequence(n.sequence ?? 'seq');
	const view =
		(n.viewSchema ? archive.view(n.view ?? 'v', { id: integer() }) : pgView(n.view ?? 'v', { id: integer() }))
			.as(sql`select 1 as id`);
	return { archive, mood, role, users, posts, sequence, view };
};
const RENAMES: Record<string, { renamed: Names; hint: string }> = {
	schema: { renamed: { schema: 'archive2' }, hint: 'archive->archive2' },
	table: { renamed: { table: 'people' }, hint: 'public.users->public.people' },
	'table to schema': { renamed: { postsSchema: 'archive' }, hint: 'public.posts->archive.posts' },
	column: { renamed: { column: 'mail' }, hint: 'public.users.email->public.users.mail' },
	index: { renamed: { index: 'users_email_ix2' }, hint: 'public.users.users_email_ix->public.users.users_email_ix2' },
	'primary key': { renamed: { pk: 'users_pk2' }, hint: 'public.users.users_pk->public.users.users_pk2' },
	unique: { renamed: { unique: 'users_email_uq2' }, hint: 'public.users.users_email_uq->public.users.users_email_uq2' },
	'foreign key': { renamed: { fk: 'posts_user_fk2' }, hint: 'public.posts.posts_user_fk->public.posts.posts_user_fk2' },
	check: { renamed: { check: 'users_n_ck2' }, hint: 'public.users.users_n_ck->public.users.users_n_ck2' },
	enum: { renamed: { enum: 'mood2' }, hint: 'public.mood->public.mood2' },
	'enum to schema': { renamed: { enumSchema: 'archive' }, hint: 'public.mood->archive.mood' },
	sequence: { renamed: { sequence: 'seq2' }, hint: 'public.seq->public.seq2' },
	'sequence to schema': { renamed: { sequenceSchema: 'archive' }, hint: 'public.seq->archive.seq' },
	view: { renamed: { view: 'v2' }, hint: 'public.v->public.v2' },
	'view to schema': { renamed: { viewSchema: 'archive' }, hint: 'public.v->archive.v' },
	policy: { renamed: { policy: 'users_pol2' }, hint: 'public.users.users_pol->public.users.users_pol2' },
	role: { renamed: { role: 'r2' }, hint: 'r->r2' },
};

// The matrix row that stands for a statement. rename_constraint has one row for each constraint kind.
const rowOf = (statement: JsonStatement) =>
	statement.type === 'rename_constraint' ? `${statement.type}:${statement.entityType}` : statement.type;
const isRename = (statement: JsonStatement) =>
	statement.type.startsWith('rename_') || statement.type.startsWith('move_');
// The kinds of nodes (`pk`, `col`, ...) that the claims of a statement name.
const claimKinds = (statement: JsonStatement) => {
	const { owns = [], destroys = [], needs = [] } = (postgresCommutativity as any).buildFacetPaths(statement);
	const kinds = (keys: string[]) => [...new Set(keys.map((key) => key.split('|')[1]))].sort();
	return { writes: kinds([...owns, ...destroys]), reads: kinds(needs) };
};

test('every rename that the diff writes has a matrix row with claims on the same kinds of nodes', async () => {
	const seen = new Set<string>();
	for (const [name, { renamed, hint }] of Object.entries(RENAMES)) {
		const { statements } = await diff(schemaWith(), schemaWith(renamed), [hint]);
		const renames = statements.filter(isRename);
		expect(renames, `the ${name} rename writes no rename statement`).not.toEqual([]);
		for (const statement of renames) {
			const row = rowOf(statement);
			seen.add(row);
			expect(TYPES, `the ${name} rename writes ${row}, which has no matrix row`).toContain(row);
			expect(claimKinds(build(row)), `matrix row ${row} and the ${name} rename claim other kinds of nodes`)
				.toEqual(claimKinds(statement));
		}
	}
	const stale = TYPES.filter((row) => (row.startsWith('rename_') || row.startsWith('move_')) && !seen.has(row));
	expect(stale, 'matrix rows that no rename of the fixture schema writes').toEqual([]);
});

test('a constraint rename of an unknown kind throws', async () => {
	const statement = { ...build('rename_constraint:uniques'), entityType: 'indexes' } as unknown as JsonStatement;

	await expect(postgresCommutativity.getReasonsFromStatements([statement], [])).rejects.toThrow(
		"rename_constraint has the unknown constraint kind 'indexes'",
	);
});

test('visualizer page builds from the committed matrix', () => {
	const template = readFileSync(templatePath, 'utf8');
	expect(template.split(placeholder)).toHaveLength(2);

	const data = readFileSync(matrixPath, 'utf8').trim();
	const page = template.replace(placeholder, () => data);
	expect(page).not.toContain(placeholder);
	if (process.env.MATRIX_HTML) writeFileSync(process.env.MATRIX_HTML, page);
});
