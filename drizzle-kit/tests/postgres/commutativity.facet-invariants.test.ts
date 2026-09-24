import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { drySnapshot, type PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { expect, test } from 'vitest';

// ---------------------------------------------------------------------------
// Algorithmic commutativity test suite.
//
// Rather than hand-picking scenarios, we generate every statement type inside
// a parameterized "namespace" (a private set of schema/table/column/... names)
// and assert first-principles INVARIANTS that any correct commutativity model
// must satisfy. The oracles are derived from what commutativity means, not from
// buildFacetPaths, so they catch mapping bugs (wrong field, missing cross-ref,
// over-broad key) rather than tautologically agreeing with the implementation.
// ---------------------------------------------------------------------------

type NS = ReturnType<typeof ns>;

function ns(id: string) {
	const p = (n: string) => `${id}_${n}`;
	return {
		id,
		schema: p('s'),
		toSchema: p('s2'),
		table: p('t'),
		table2: p('t2'),
		col: p('c'),
		col2: p('c2'),
		index: p('ix'),
		unique: p('uq'),
		check: p('ck'),
		fk: p('fk'),
		policy: p('pol'),
		enum: p('en'),
		seq: p('sq'),
		view: p('vw'),
		role: p('r'),
		to: p('to'),
	};
}

const column = (n: NS, name = n.col, enumType = false) => ({
	schema: n.schema,
	table: n.table,
	name,
	type: enumType ? n.enum : 'varchar',
	typeSchema: enumType ? n.schema : 'pg_catalog',
	notNull: false,
	dimensions: 0,
	default: null,
	generated: null,
	identity: null,
});

const indexObj = (n: NS, name = n.index, cols = [n.col]) => ({
	schema: n.schema,
	table: n.table,
	name,
	nameExplicit: true,
	isUnique: false,
	where: null,
	with: '',
	method: 'btree',
	concurrently: false,
	columns: cols.map((value) => ({
		value,
		isExpression: false,
		asc: true,
		nullsFirst: false,
		opclass: { name: '', default: true },
	})),
});

// Build a statement of `type` entirely within namespace `n`. Extra fields the
// facet model ignores are omitted. `opts` lets drop-dominance tests aim a
// cross-reference (index/pk/fk/unique/enum-column) at a specific resource.
function build(type: string, n: NS, opts: { cols?: string[]; enumCol?: boolean } = {}): JsonStatement {
	const cols = opts.cols ?? [n.col];
	switch (type) {
		case 'create_table':
			return { type, table: { schema: n.schema, name: n.table, isRlsEnabled: false } } as any;
		case 'drop_table':
			return {
				type,
				table: { schema: n.schema, name: n.table, isRlsEnabled: false },
				key: `${n.schema}.${n.table}`,
			} as any;
		case 'rename_table':
			return { type, schema: n.schema, from: n.table, to: n.to } as any;
		case 'move_table':
			return { type, name: n.table, from: n.schema, to: n.toSchema } as any;

		case 'add_column':
			return { type, column: column(n, n.col, opts.enumCol), isPK: false, isCompositePK: false } as any;
		case 'drop_column':
			return { type, column: column(n) } as any;
		case 'alter_column':
			return { type, to: column(n), diff: { schema: n.schema, table: n.table, name: n.col } } as any;
		case 'recreate_column':
			return { type, diff: { schema: n.schema, table: n.table, name: n.col } } as any;
		case 'rename_column':
			return { type, from: column(n, n.col), to: column(n, n.to) } as any;

		case 'create_index':
			return { type, index: indexObj(n, n.index, cols) } as any;
		case 'drop_index':
			return { type, index: indexObj(n, n.index, cols) } as any;
		case 'recreate_index':
			return { type, index: indexObj(n, n.index, cols), diff: { schema: n.schema, name: n.index } } as any;
		case 'rename_index':
			return { type, schema: n.schema, table: n.table, from: n.index, to: n.to, columns: [n.col] } as any;

		case 'add_pk':
			return {
				type,
				pk: { schema: n.schema, table: n.table, name: `${n.table}_pkey`, nameExplicit: false, columns: cols },
			} as any;
		case 'drop_pk':
			return {
				type,
				pk: { schema: n.schema, table: n.table, name: `${n.table}_pkey`, nameExplicit: false, columns: cols },
			} as any;
		case 'alter_pk':
			return {
				type,
				pk: { schema: n.schema, table: n.table, name: `${n.table}_pkey`, nameExplicit: false, columns: cols },
				diff: { schema: n.schema, table: n.table },
			} as any;

		case 'create_fk':
		case 'recreate_fk':
			return {
				type,
				fk: {
					schema: n.schema,
					table: n.table,
					name: n.fk,
					nameExplicit: true,
					columns: cols,
					schemaTo: n.schema,
					tableTo: n.table2,
					columnsTo: [n.col2],
					onUpdate: null,
					onDelete: null,
				},
				diff: {},
			} as any;
		case 'drop_fk':
			return {
				type,
				fk: {
					schema: n.schema,
					table: n.table,
					name: n.fk,
					nameExplicit: true,
					columns: cols,
					schemaTo: n.schema,
					tableTo: n.table2,
					columnsTo: [n.col2],
					onUpdate: null,
					onDelete: null,
				},
			} as any;

		case 'add_unique':
			return {
				type,
				unique: {
					schema: n.schema,
					table: n.table,
					name: n.unique,
					nameExplicit: true,
					columns: cols,
					nullsNotDistinct: false,
				},
			} as any;
		case 'drop_unique':
			return {
				type,
				unique: {
					schema: n.schema,
					table: n.table,
					name: n.unique,
					nameExplicit: true,
					columns: cols,
					nullsNotDistinct: false,
				},
			} as any;
		case 'alter_unique':
			return {
				type,
				diff: {
					schema: n.schema,
					table: n.table,
					name: n.unique,
					$left: { columns: [n.col] },
					$right: { columns: [n.col] },
				},
			} as any;

		case 'add_check':
			return {
				type,
				check: { schema: n.schema, table: n.table, name: n.check, value: `${n.col} > 0` },
				columns: [n.col],
			} as any;
		case 'drop_check':
			return {
				type,
				check: { schema: n.schema, table: n.table, name: n.check, value: `${n.col} > 0` },
				columns: [n.col],
			} as any;
		case 'alter_check':
			return {
				type,
				diff: { schema: n.schema, table: n.table, name: n.check },
				newColumns: [n.col],
				oldColumns: [n.col],
			} as any;

		case 'rename_constraint':
			return { type, schema: n.schema, table: n.table, from: n.unique, to: n.to, columns: [n.col] } as any;

		case 'create_enum':
			return { type, enum: { schema: n.schema, name: n.enum, values: ['a', 'b'] } } as any;
		case 'drop_enum':
			return { type, enum: { schema: n.schema, name: n.enum, values: ['a', 'b'] } } as any;
		case 'rename_enum':
			return { type, schema: n.schema, from: n.enum, to: n.to } as any;
		case 'alter_enum':
			return { type, to: { schema: n.schema, name: n.enum, values: ['a', 'b'] } } as any;
		case 'recreate_enum':
			return { type, to: { schema: n.schema, name: n.enum, values: ['a', 'b'] } } as any;
		case 'move_enum':
			return { type, from: { schema: n.schema, name: n.enum }, to: { schema: n.toSchema, name: n.enum } } as any;
		case 'alter_type_drop_value':
			return { type, enum: { schema: n.schema, name: n.enum, values: ['a'] } } as any;

		case 'create_sequence':
			return { type, sequence: { schema: n.schema, name: n.seq } } as any;
		case 'drop_sequence':
			return { type, sequence: { schema: n.schema, name: n.seq } } as any;
		case 'rename_sequence':
			return { type, from: { schema: n.schema, name: n.seq }, to: { schema: n.schema, name: n.to } } as any;
		case 'alter_sequence':
			return { type, sequence: { schema: n.schema, name: n.seq } } as any;
		case 'move_sequence':
			return { type, from: { schema: n.schema, name: n.seq }, to: { schema: n.toSchema, name: n.seq } } as any;

		case 'create_view':
			return { type, view: { schema: n.schema, name: n.view } } as any;
		case 'drop_view':
			return { type, view: { schema: n.schema, name: n.view } } as any;
		case 'rename_view':
			return { type, from: { schema: n.schema, name: n.view }, to: { schema: n.schema, name: n.to } } as any;
		case 'alter_view':
			return { type, view: { schema: n.schema, name: n.view } } as any;
		case 'move_view':
			return { type, fromSchema: n.schema, toSchema: n.toSchema, view: { schema: n.toSchema, name: n.view } } as any;

		case 'create_schema':
			return { type, name: n.schema } as any;
		case 'drop_schema':
			return { type, name: n.schema } as any;
		case 'rename_schema':
			return { type, from: { name: n.schema }, to: { name: n.to } } as any;

		case 'create_policy':
		case 'alter_policy':
		case 'recreate_policy':
			return {
				type,
				policy: {
					schema: n.schema,
					table: n.table,
					name: n.policy,
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
					schema: n.schema,
					table: n.table,
					name: n.policy,
					as: 'PERMISSIVE',
					for: 'ALL',
					roles: ['public'],
					using: null,
					withCheck: null,
				},
			} as any;
		case 'rename_policy':
			return {
				type,
				from: { schema: n.schema, table: n.table, name: n.policy },
				to: { schema: n.schema, table: n.table, name: n.to },
			} as any;

		case 'alter_rls':
			return { type, schema: n.schema, name: n.table, isRlsEnabled: true } as any;

		case 'create_role':
		case 'alter_role':
			return { type, role: { name: n.role } } as any;
		case 'drop_role':
			return { type, role: { name: n.role } } as any;
		case 'rename_role':
			return { type, from: { name: n.role }, to: { name: n.to } } as any;

		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege':
			return {
				type,
				privilege: {
					schema: n.schema,
					table: n.table,
					grantee: n.role,
					grantor: 'postgres',
					type: 'SELECT',
					isGrantable: false,
				},
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

// cluster-level types (not under any schema)
const ROLE_TYPES = new Set(['create_role', 'drop_role', 'rename_role', 'alter_role']);
// types whose target is the table itself or a child/aspect of the table
const UNDER_TABLE = new Set([
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
	'create_policy',
	'drop_policy',
	'rename_policy',
	'alter_policy',
	'recreate_policy',
	'alter_rls',
	'grant_privilege',
	'revoke_privilege',
	'regrant_privilege',
]);
// types that reference specific columns of the table
const REFERENCES_COLUMN = new Set([
	'create_index',
	'recreate_index',
	'add_pk',
	'alter_pk',
	'add_unique',
	'create_fk',
	'recreate_fk',
]);

async function conflicts(a: JsonStatement[], b: JsonStatement[]): Promise<boolean> {
	return !!(await postgresCommutativity.getReasonsFromStatements(a, b, drySnapshot as PostgresSnapshot));
}

const A = ns('A');
const B = ns('B');

// one case per (t1, t2) so the reported test count reflects real coverage
const PAIRS = TYPES.flatMap((t1) => TYPES.map((t2) => ({ t1, t2 })));
const SELF = TYPES.map((t) => ({ t }));
const UNDER_TABLE_CASES = TYPES.filter((t) => UNDER_TABLE.has(t) && t !== 'drop_table').map((t) => ({ t }));
const IN_SCHEMA_CASES = TYPES.filter((t) => !ROLE_TYPES.has(t) && t !== 'drop_schema').map((t) => ({ t }));
const COL_REF_CASES = [...REFERENCES_COLUMN].map((t) => ({ t }));

// Flat, top-level tests (no describe nesting) so running the file executes the
// whole matrix as one list — a per-block name filter can't split the count.

test('builder covers every statement type', () => {
	const missing = TYPES.filter((t) => {
		try {
			build(t, A);
			return false;
		} catch {
			return true;
		}
	});
	expect(missing).toEqual([]);
});

test.each(PAIRS)('disjoint commute: $t1 ∥ $t2', async ({ t1, t2 }) => {
	expect(await conflicts([build(t1, A)], [build(t2, B)])).toBe(false);
});

test.each(SELF)('self-conflict: $t ∥ $t', async ({ t }) => {
	expect(await conflicts([build(t, A)], [build(t, A)])).toBe(true);
});

test.each(PAIRS)('symmetric: $t1 ∥ $t2', async ({ t1, t2 }) => {
	const ab = await conflicts([build(t1, A)], [build(t2, A)]);
	const ba = await conflicts([build(t2, A)], [build(t1, A)]);
	expect(ab).toBe(ba);
});

test.each(UNDER_TABLE_CASES)('drop_table dominates: $t', async ({ t }) => {
	expect(await conflicts([build('drop_table', A)], [build(t, A)])).toBe(true);
});

test.each(IN_SCHEMA_CASES)('drop_schema dominates: $t', async ({ t }) => {
	expect(await conflicts([build('drop_schema', A)], [build(t, A)])).toBe(true);
});

test.each(COL_REF_CASES)('drop_column dominates: $t', async ({ t }) => {
	expect(await conflicts([build('drop_column', A)], [build(t, A, { cols: [A.col] })])).toBe(true);
});

// strict commutativity: renaming/moving a table breaks every reference to it,
// exactly like dropping it — replaying the reference in the wrong order fails.
test.each(UNDER_TABLE_CASES.filter(({ t }) => t !== 'rename_table' && t !== 'move_table'))(
	'rename_table conflicts with reference: $t',
	async ({ t }) => {
		expect(await conflicts([build('rename_table', A)], [build(t, A)])).toBe(true);
	},
);
test.each(UNDER_TABLE_CASES.filter(({ t }) => t !== 'rename_table' && t !== 'move_table'))(
	'move_table conflicts with reference: $t',
	async ({ t }) => {
		expect(await conflicts([build('move_table', A)], [build(t, A)])).toBe(true);
	},
);

test('drop_enum dominates a column of that enum type', async () => {
	expect(await conflicts([build('drop_enum', A)], [build('add_column', A, { enumCol: true })])).toBe(true);
});

test('monotonicity: adding statements never removes a conflict', async () => {
	// a known conflict: drop_table(A) ∥ add_column(A)
	expect(await conflicts([build('drop_table', A)], [build('add_column', A)])).toBe(true);
	// same conflict must persist when each branch carries extra disjoint work
	expect(
		await conflicts(
			[build('drop_table', A), build('create_sequence', B)],
			[build('add_column', A), build('create_view', B)],
		),
	).toBe(true);
});
