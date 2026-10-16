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
import { toSnapshotStatement } from 'src/dialects/postgres/convertor';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { expect, test } from 'vitest';
import { build, rows } from './commutativity-statements';
import { diff } from './mocks';

// Verifies that the committed `commutativity-matrix.json` matches the verdicts of the facet rules for every pair
// of statements in `commutativity-statements.ts`. It also verifies that each rename or move that the real diff
// writes has a matrix row whose facet paths name the same kinds of nodes.

// The first test keeps `commutativity-matrix.json` equal to the verdicts of the rules, because the
// ground-truth test checks that file against postgres. Rewrite the file after a rule change:
//   UPDATE_MATRIX=1 pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts
// Write the matrix with `family` and `reasons` for the visualizer page:
//   GEN_MATRIX=<out.json> pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts
const matrixPath = join(import.meta.dirname, 'commutativity-matrix.json');

const catalog = rows();
const TYPES = Object.keys(catalog);

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
	priv: 'privilege on',
	colprop: 'property of column',
	ukey: 'unique key on',
	rel: 'relation name',
	type: 'type name',
	con: 'constraint name',
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

// The facet paths of a statement, for the impossible marks and the reason sentences.
function facetSets(stmt: JsonStatement) {
	const { writes, reads = [], sharedWrites = [] } = postgresCommutativity.buildFacetPaths(toSnapshotStatement(stmt));
	return {
		writes: new Set<string>(writes),
		reads: new Set<string>(reads),
		sharedWrites: new Set<string>(sharedWrites),
	};
}

async function conflict(a: JsonStatement, b: JsonStatement): Promise<boolean> {
	return !!(await postgresCommutativity.getReasonsFromStatements([toSnapshotStatement(a)], [toSnapshotStatement(b)]));
}

async function generateMatrix() {
	const stmts = TYPES.map((type) => catalog[type].statement);
	const sets = stmts.map(facetSets);

	// `matrix` and `impossible` hold one string of 0 and 1 for each row.
	const matrix: string[] = [];
	const impossible: string[] = [];
	const reasons: Record<string, string[]> = {};

	// `impossibleWhy` finds the pairs that cannot come from one fork point: one statement creates a node, and
	// the other statement needs that node to exist already. The rules still report such a pair as a conflict.
	const isCreate = (i: number) => !!catalog[TYPES[i]].isCreate;
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
				}</b> assumes already exists, so they can't come from the same fork point.`;
			}
		}
		for (const k of creates(j)) {
			if (assumesExists(i).has(k)) {
				return `<b>${TYPES[j]}</b> creates <code>${pretty(k)}</code>, which <b>${
					TYPES[i]
				}</b> assumes already exists, so they can't come from the same fork point.`;
			}
		}
		return null;
	};

	// `why` gives the reason sentences of a cell for the visualizer page, one for each shared node. A node can
	// appear in several facets, so `seen` removes repeated sentences.
	const why = (i: number, j: number): string[] => {
		const A = sets[i], B = sets[j], out: string[] = [], seen = new Set<string>();
		for (const k of new Set([...A.writes, ...B.writes, ...A.sharedWrites, ...B.sharedWrites])) {
			const res = `<code>${pretty(k)}</code>`;
			const aw = A.writes.has(k), bw = B.writes.has(k), ar = A.reads.has(k), br = B.reads.has(k);
			let sentence: string | null = null;
			if (aw && bw) sentence = `<b>${TYPES[i]}</b> and <b>${TYPES[j]}</b> both change ${res}`;
			else if ((aw || A.sharedWrites.has(k)) && br) {
				sentence = `<b>${TYPES[i]}</b> ${verb(TYPES[i])} ${res}, which <b>${TYPES[j]}</b> references`;
			} else if ((bw || B.sharedWrites.has(k)) && ar) {
				sentence = `<b>${TYPES[j]}</b> ${verb(TYPES[j])} ${res}, which <b>${TYPES[i]}</b> references`;
			}
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
		matrix.push(row.join(''));
		impossible.push(irow.join(''));
	}

	const family = Object.fromEntries(TYPES.map((type) => [type, catalog[type].family]));
	return { types: TYPES, family, matrix, impossible, reasons };
}

// The committed file holds `types`, `matrix` and `impossible`. It leaves out `family` and `reasons`, because
// only the visualizer page reads them.
test('committed matrix matches the rules', async () => {
	const { types, matrix, impossible } = await generateMatrix();
	const fresh = { types, matrix, impossible };
	// The tab indent matches the layout that dprint keeps, so a formatter run does not change the file.
	if (process.env.UPDATE_MATRIX) writeFileSync(matrixPath, JSON.stringify(fresh, null, '\t') + '\n');

	const committed = JSON.parse(readFileSync(matrixPath, 'utf8'));
	expect(
		fresh,
		'The commutativity rules changed. Review the matrix diff, then rewrite commutativity-matrix.json with '
			+ 'UPDATE_MATRIX=1 pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts',
	).toEqual(committed);
});

// The fixtures of the rename test below. `schemaWith` builds a schema with one entity of every kind that the
// diff can rename or move. In `RENAMES`, `renamed` gives the names after one rename, and `hint` is the rename
// decision for it.
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

// Finds the matrix row of a statement that the diff writes. `rename_constraint` has one row for each
// constraint kind.
const rowOf = (statement: JsonStatement) =>
	statement.type === 'rename_constraint' ? `${statement.type}:${statement.entityType}` : statement.type;
const isRename = (statement: JsonStatement) =>
	statement.type.startsWith('rename_') || statement.type.startsWith('move_');
// The kinds of nodes (`pk`, `col`, etc.) that the facet paths of a statement name, so that the rename test can
// compare a matrix row with a real rename.
const nodeKinds = (statement: JsonStatement) => {
	const { writes, reads = [] } = postgresCommutativity.buildFacetPaths(toSnapshotStatement(statement));
	const kinds = (keys: string[]) => [...new Set(keys.map((key) => key.split('|')[1]))].sort();
	return { writes: kinds(writes), reads: kinds(reads) };
};

test('every rename that the diff writes has a matrix row whose facet paths name the same kinds of nodes', async () => {
	const seen = new Set<string>();
	for (const [name, { renamed, hint }] of Object.entries(RENAMES)) {
		const { statements } = await diff(schemaWith(), schemaWith(renamed), [hint]);
		const renames = statements.filter(isRename);
		expect(renames, `the ${name} rename writes no rename statement`).not.toEqual([]);
		for (const statement of renames) {
			const row = rowOf(statement);
			seen.add(row);
			expect(TYPES, `the ${name} rename writes ${row}, which has no matrix row`).toContain(row);
			expect(
				nodeKinds(build(row)),
				`the facet paths of matrix row ${row} and of the ${name} rename name other kinds of nodes`,
			)
				.toEqual(nodeKinds(statement));
		}
	}
	const stale = TYPES.filter((row) => (row.startsWith('rename_') || row.startsWith('move_')) && !seen.has(row));
	expect(stale, 'matrix rows that no rename of the fixture schema writes').toEqual([]);
});

test.runIf(process.env.GEN_MATRIX)('generate conflict matrix json', async () => {
	writeFileSync(process.env.GEN_MATRIX!, JSON.stringify(await generateMatrix()));
});
