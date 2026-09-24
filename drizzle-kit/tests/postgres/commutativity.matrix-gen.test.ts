import { writeFileSync } from 'fs';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { drySnapshot, type PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { test } from 'vitest';

// Generates the conflict matrix (with reasons) for the HTML visualizer.
// Run with:  GEN_MATRIX=<output.json> npx vitest run tests/postgres/commutativity.matrix-gen.test.ts
const OUT = process.env.GEN_MATRIX;

const col = (schema: string, table: string, name: string, enumType = false) =>
	({
		schema,
		table,
		name,
		type: enumType ? 'e' : 'varchar',
		typeSchema: enumType ? 's' : 'pg_catalog',
		notNull: false,
		dimensions: 0,
		default: null,
		generated: null,
		identity: null,
	}) as any;
const idx = (schema: string, table: string, name: string, columns: string[]) =>
	({
		schema,
		table,
		name,
		nameExplicit: true,
		isUnique: false,
		where: null,
		with: '',
		method: 'btree',
		concurrently: false,
		columns: columns.map((value) => ({
			value,
			isExpression: false,
			asc: true,
			nullsFirst: false,
			opclass: { name: '', default: true },
		})),
	}) as any;

// Every statement targets the same table s.t (column c1) so the matrix shows the
// maximum-overlap blocking relationship between statement types.
const S = 's', T = 't', C = 'c1';
function build(type: string): JsonStatement {
	switch (type) {
		case 'create_table':
			return { type, table: { schema: S, name: T, isRlsEnabled: false } } as any;
		case 'drop_table':
			return { type, table: { schema: S, name: T, isRlsEnabled: false }, key: `${S}.${T}` } as any;
		case 'rename_table':
			return { type, schema: S, from: T, to: 't_new' } as any;
		case 'move_table':
			return { type, name: T, from: S, to: 's_new' } as any;
		case 'add_column':
			return { type, column: col(S, T, C), isPK: false, isCompositePK: false } as any;
		case 'drop_column':
			return { type, column: col(S, T, C) } as any;
		case 'alter_column':
			return { type, to: col(S, T, C), diff: { schema: S, table: T, name: C } } as any;
		case 'recreate_column':
			return { type, diff: { schema: S, table: T, name: C } } as any;
		case 'rename_column':
			return { type, from: col(S, T, C), to: col(S, T, 'c_new') } as any;
		case 'create_index':
			return { type, index: idx(S, T, 'ix', [C]) } as any;
		case 'drop_index':
			return { type, index: idx(S, T, 'ix', [C]) } as any;
		case 'recreate_index':
			return { type, index: idx(S, T, 'ix', [C]), diff: { schema: S, name: 'ix' } } as any;
		case 'rename_index':
			return { type, schema: S, table: T, from: 'ix', to: 'ix_new', columns: [C] } as any;
		case 'add_pk':
			return { type, pk: { schema: S, table: T, name: 't_pkey', nameExplicit: false, columns: [C] } } as any;
		case 'drop_pk':
			return { type, pk: { schema: S, table: T, name: 't_pkey', nameExplicit: false, columns: [C] } } as any;
		case 'alter_pk':
			return {
				type,
				pk: { schema: S, table: T, name: 't_pkey', nameExplicit: false, columns: [C] },
				diff: { schema: S, table: T },
			} as any;
		case 'create_fk':
		case 'recreate_fk':
			return {
				type,
				fk: {
					schema: S,
					table: T,
					name: 'fk',
					nameExplicit: true,
					columns: [C],
					schemaTo: S,
					tableTo: 't2',
					columnsTo: ['c2'],
					onUpdate: null,
					onDelete: null,
				},
				diff: {},
			} as any;
		case 'drop_fk':
			return {
				type,
				fk: {
					schema: S,
					table: T,
					name: 'fk',
					nameExplicit: true,
					columns: [C],
					schemaTo: S,
					tableTo: 't2',
					columnsTo: ['c2'],
					onUpdate: null,
					onDelete: null,
				},
			} as any;
		case 'add_unique':
			return {
				type,
				unique: { schema: S, table: T, name: 'uq', nameExplicit: true, columns: [C], nullsNotDistinct: false },
			} as any;
		case 'drop_unique':
			return {
				type,
				unique: { schema: S, table: T, name: 'uq', nameExplicit: true, columns: [C], nullsNotDistinct: false },
			} as any;
		case 'alter_unique':
			return {
				type,
				diff: { schema: S, table: T, name: 'uq', $left: { columns: [C] }, $right: { columns: [C] } },
			} as any;
		case 'add_check':
			return { type, check: { schema: S, table: T, name: 'ck', value: `${C} > 0` }, columns: [C] } as any;
		case 'drop_check':
			return { type, check: { schema: S, table: T, name: 'ck', value: `${C} > 0` }, columns: [C] } as any;
		case 'alter_check':
			return { type, diff: { schema: S, table: T, name: 'ck' }, newColumns: [C], oldColumns: [C] } as any;
		case 'rename_constraint':
			return { type, schema: S, table: T, from: 'uq', to: 'uq_new', columns: [C] } as any;
		case 'create_enum':
			return { type, enum: { schema: S, name: 'e', values: ['a', 'b'] } } as any;
		case 'drop_enum':
			return { type, enum: { schema: S, name: 'e', values: ['a', 'b'] } } as any;
		case 'rename_enum':
			return { type, schema: S, from: 'e', to: 'e_new' } as any;
		case 'alter_enum':
			return { type, to: { schema: S, name: 'e', values: ['a', 'b'] } } as any;
		case 'recreate_enum':
			return { type, to: { schema: S, name: 'e', values: ['a', 'b'] } } as any;
		case 'move_enum':
			return { type, from: { schema: S, name: 'e' }, to: { schema: 's_new', name: 'e' } } as any;
		case 'alter_type_drop_value':
			return { type, enum: { schema: S, name: 'e', values: ['a'] } } as any;
		case 'create_sequence':
			return { type, sequence: { schema: S, name: 'sq' } } as any;
		case 'drop_sequence':
			return { type, sequence: { schema: S, name: 'sq' } } as any;
		case 'rename_sequence':
			return { type, from: { schema: S, name: 'sq' }, to: { schema: S, name: 'sq_new' } } as any;
		case 'alter_sequence':
			return { type, sequence: { schema: S, name: 'sq' } } as any;
		case 'move_sequence':
			return { type, from: { schema: S, name: 'sq' }, to: { schema: 's_new', name: 'sq' } } as any;
		case 'create_view':
			return { type, view: { schema: S, name: 'vw' } } as any;
		case 'drop_view':
			return { type, view: { schema: S, name: 'vw' } } as any;
		case 'rename_view':
			return { type, from: { schema: S, name: 'vw' }, to: { schema: S, name: 'vw_new' } } as any;
		case 'alter_view':
			return { type, view: { schema: S, name: 'vw' } } as any;
		case 'move_view':
			return { type, fromSchema: S, toSchema: 's_new', view: { schema: 's_new', name: 'vw' } } as any;
		case 'create_schema':
			return { type, name: S } as any;
		case 'drop_schema':
			return { type, name: S } as any;
		case 'rename_schema':
			return { type, from: { name: S }, to: { name: 's_new' } } as any;
		case 'create_policy':
		case 'alter_policy':
		case 'recreate_policy':
			return {
				type,
				policy: {
					schema: S,
					table: T,
					name: 'pol',
					as: 'PERMISSIVE',
					for: 'ALL',
					roles: ['public'],
					using: null,
					withCheck: null,
				},
				diff: {},
			} as any;
		case 'drop_policy':
			return {
				type,
				policy: {
					schema: S,
					table: T,
					name: 'pol',
					as: 'PERMISSIVE',
					for: 'ALL',
					roles: ['public'],
					using: null,
					withCheck: null,
				},
			} as any;
		case 'rename_policy':
			return { type, from: { schema: S, table: T, name: 'pol' }, to: { schema: S, table: T, name: 'pol_new' } } as any;
		case 'alter_rls':
			return { type, schema: S, name: T, isRlsEnabled: true } as any;
		case 'create_role':
		case 'alter_role':
			return { type, role: { name: 'r' } } as any;
		case 'drop_role':
			return { type, role: { name: 'r' } } as any;
		case 'rename_role':
			return { type, from: { name: 'r' }, to: { name: 'r_new' } } as any;
		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege':
			return {
				type,
				privilege: { schema: S, table: T, grantee: 'r', grantor: 'postgres', type: 'SELECT', isGrantable: false },
			} as any;
		default:
			throw new Error(`no builder for ${type}`);
	}
}

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

// Ops that bring a NEW node into existence (they assert the node did NOT exist at
// the base). A create-of-X can't share a base with a statement that assumes X
// already existed (references it, or drops/renames/alters it) — an "impossible"
// pair, distinct from an ordinary non-commutative conflict between two realizable
// branches. This is viz-only; the engine still (correctly) reports both as blocks.
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
]);

async function conflict(a: JsonStatement, b: JsonStatement): Promise<boolean> {
	return !!(await postgresCommutativity.getReasonsFromStatements([a], [b], drySnapshot as PostgresSnapshot));
}

test('generate conflict matrix json', async () => {
	if (!OUT) return; // no-op unless generating

	const stmts = TYPES.map(build);
	const sets = stmts.map(facetSets);

	const matrix: number[][] = [];
	const impossible: number[][] = [];
	const reasons: Record<string, string[]> = {};

	// nodes a statement CREATES (asserts didn't exist at base)
	const creates = (i: number) => (CREATE_OPS.has(TYPES[i]) ? [...sets[i].writes] : []);
	// nodes a statement assumes ALREADY EXISTED at base (references, or drops/renames/alters)
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

	// one sentence per shared resource explaining why i and j don't commute
	// (a node can now share several facets — s|/n|/e| — so dedupe identical sentences)
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
	writeFileSync(
		OUT,
		JSON.stringify(
			{ types: TYPES, family: FAMILY, matrix, impossible, reasons, conflictsCount, impossibleCount },
			null,
			0,
		),
	);
	// eslint-disable-next-line no-console
	console.log(
		`\nmatrix: ${TYPES.length}x${TYPES.length}, ${conflictsCount} conflicts (${impossibleCount} impossible) -> ${OUT}\n`,
	);
});
