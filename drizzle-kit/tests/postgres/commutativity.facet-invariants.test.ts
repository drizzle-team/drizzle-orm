import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { toSnapshotStatements } from 'src/dialects/postgres/convertor';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { expect, test } from 'vitest';
import { build, rows } from './commutativity-statements';

// Verifies that the facet rules of `postgresCommutativity` meet general invariants for every statement in
// `commutativity-statements.ts`. Statements on different objects commute, two changes of one object conflict,
// and the verdict does not depend on the order of the branches. A drop of a schema, a table, a column or an enum
// conflicts with the statements that use that object, and so does a rename or a move of a table. Extra
// statements on a branch never remove a conflict. The expected verdicts follow from what a conflict means, so a
// change of the facet rules must not change them.

const TYPES = Object.keys(rows());

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
	'rename_constraint:uniques',
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

// Tells whether the facet rules see a conflict between two branches. The rules read a statement in the form
// that a snapshot stores, so `toSnapshotStatements` converts the statements first.
async function conflicts(a: JsonStatement[], b: JsonStatement[]): Promise<boolean> {
	return !!(await postgresCommutativity.getReasonsFromStatements(toSnapshotStatements(a), toSnapshotStatements(b)));
}

// `build` starts the name of every object that a statement changes with the prefix `A` or `B`. Statements
// with different prefixes change no common object, so they must commute.
const A = 'A_';
const B = 'B_';

// one case per (t1, t2) so the reported test count reflects real coverage
const PAIRS = TYPES.flatMap((t1) => TYPES.map((t2) => ({ t1, t2 })));
const SELF = TYPES.map((t) => ({ t }));
const UNDER_TABLE_CASES = TYPES.filter((t) => UNDER_TABLE.has(t) && t !== 'drop_table').map((t) => ({ t }));
const IN_SCHEMA_CASES = TYPES.filter((t) => !ROLE_TYPES.has(t) && t !== 'drop_schema').map((t) => ({ t }));
const COL_REF_CASES = [...REFERENCES_COLUMN].map((t) => ({ t }));

// Flat, top-level tests (no describe nesting) so running the file executes the
// whole matrix as one list — a per-block name filter can't split the count.

test.each(PAIRS)('disjoint commute: $t1 ∥ $t2', async ({ t1, t2 }) => {
	expect(await conflicts([build(t1, A)], [build(t2, B)])).toBe(false);
});

// The rules can treat two equal statements as one change. The `marker` field makes `other` a separate change
// of the same object, and two separate changes of one object must conflict.
test.each(SELF)('self-conflict: $t ∥ $t', async ({ t }) => {
	const [statement] = toSnapshotStatements([build(t, A)]);
	const other = Object.assign(structuredClone(statement), { marker: true });

	expect(await postgresCommutativity.getReasonsFromStatements([statement], [other])).toBeDefined();
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
	expect(await conflicts([build('drop_column', A)], [build(t, A)])).toBe(true);
});

// strict commutativity: renaming/moving a table breaks every reference to it,
// exactly like dropping it — replaying the reference in the wrong order fails.
// The SQL of `drop_index` and `rename_index` names the index without its table, so a rename of the table
// does not break them. A move of the table still breaks them, because postgres moves the index with the table.
const NAMES_NO_TABLE = new Set(['drop_index', 'rename_index']);
test.each(UNDER_TABLE_CASES.filter(({ t }) => t !== 'rename_table' && t !== 'move_table' && !NAMES_NO_TABLE.has(t)))(
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
	expect(await conflicts([build('drop_enum', A)], [build('add_column:enum', A)])).toBe(true);
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
