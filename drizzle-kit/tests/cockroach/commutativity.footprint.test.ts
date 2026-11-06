import { cockroachCommutativity } from 'src/dialects/cockroach/commutativity';
import type { JsonStatement } from 'src/dialects/cockroach/statements';
import { describe, expect, test } from 'vitest';
import { build, col, footprintsOfStatements, idx, policy, rows } from './commutativity-catalog';

// Verifies the verdict of the cockroach footprint rules for a fixed list of branch pairs, and the algebraic
// invariants over the whole catalog. The pairs cover renames and drops of referenced objects, the two scopes of
// an index name, the uniqueness that a foreign key needs, and the changes that count as one when both branches
// make them.

const conflicts = (a: JsonStatement[], b: JsonStatement[]) =>
	!!cockroachCommutativity.findConflict(footprintsOfStatements(a), footprintsOfStatements(b));

type Case = { name: string; a: JsonStatement[]; b: JsonStatement[]; expect: 'conflict' | 'commute' };

const S = {
	createIndex: (table: string, name: string, columns: string[], unique = false): JsonStatement => ({
		type: 'create_index',
		index: idx('public', table, name, columns, { isUnique: unique }),
		newTable: false,
	}),
	dropIndex: (table: string, name: string, columns: string[], unique = false): JsonStatement => ({
		type: 'drop_index',
		index: idx('public', table, name, columns, { isUnique: unique }),
	}),
	addColumn: (table: string, name: string): JsonStatement => ({
		type: 'add_column',
		column: col('public', table, name),
	}),
	renameColumn: (table: string, from: string, to: string): JsonStatement => ({
		type: 'rename_column',
		from: col('public', table, from),
		to: col('public', table, to),
	}),
};

const cases: Case[] = [
	{
		name: 'rename_column c ∥ create_index on c conflict',
		a: [S.renameColumn('users', 'c', 'c2')],
		b: [S.createIndex('users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'rename_column c ∥ create_index on d commute',
		a: [S.renameColumn('users', 'c', 'c2')],
		b: [S.createIndex('users', 'ix', ['d'])],
		expect: 'commute',
	},
	{
		name: 'drop_column c ∥ create_index on c conflict',
		a: [{ type: 'drop_column', column: col('public', 'users', 'c') }],
		b: [S.createIndex('users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'drop_column c ∥ rename_column c conflict',
		a: [{ type: 'drop_column', column: col('public', 'users', 'c') }],
		b: [S.renameColumn('users', 'c', 'c2')],
		expect: 'conflict',
	},
	{
		name: 'the same index name on two tables commutes for two creates',
		a: [S.createIndex('users', 'ix', ['c'])],
		b: [S.createIndex('posts', 'ix', ['c'])],
		expect: 'commute',
	},
	{
		name: 'the same index name on two tables commutes for a rename and a drop',
		a: [build('rename_index')],
		b: [S.dropIndex('posts', 'ix', ['c'])],
		expect: 'commute',
	},
	{
		name: 'create_index ∥ drop_index on the same table conflict',
		a: [S.createIndex('users', 'ix', ['c'])],
		b: [S.dropIndex('users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'rename_table ∥ drop_index on that table conflict, because the drop names the table',
		a: [{ type: 'rename_table', schema: 'public', from: 'users', to: 'people' }],
		b: [S.dropIndex('users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'rename_table ∥ rename_index on that table conflict, because the rename names the table',
		a: [{ type: 'rename_table', schema: 's', from: 't', to: 't_new' }],
		b: [build('rename_index')],
		expect: 'conflict',
	},
	{
		name: 'a default change ∥ a NOT NULL change on one column commute',
		a: [build('alter_column')],
		b: [build('alter_add_column_not_null')],
		expect: 'commute',
	},
	{
		name: 'the same alter_column on both branches commutes, because it is one change',
		a: [build('alter_column')],
		b: [build('alter_column')],
		expect: 'commute',
	},
	{
		name: 'drop_table ∥ add_column on that table conflicts',
		a: [build('drop_table')],
		b: [{ type: 'add_column', column: col('s', 't', 'c2') }],
		expect: 'conflict',
	},
	{
		name: 'rename_constraint of a primary key ∥ drop_column of its column conflicts',
		a: [build('rename_constraint:pk')],
		b: [{ type: 'drop_column', column: col('s', 't', 'c1') }],
		expect: 'conflict',
	},
	{
		name: 'rename_constraint of a check ∥ drop_column of its column conflicts',
		a: [build('rename_constraint:check')],
		b: [{ type: 'drop_column', column: col('s', 't', 'c1') }],
		expect: 'conflict',
	},
	{
		name: 'create_fk ∥ drop_pk on the referenced table conflicts over uniqueness',
		a: [build('create_fk')],
		b: [
			{
				type: 'drop_pk',
				pk: {
					schema: 's',
					table: 't2',
					name: 't2_pkey',
					columns: ['c2'],
					nameExplicit: true,
					entityType: 'pks',
				},
			},
		],
		expect: 'conflict',
	},
	{
		name: 'create_fk ∥ drop of a unique index on the referenced column conflicts over uniqueness',
		a: [build('create_fk')],
		b: [{ type: 'drop_index', index: idx('s', 't2', 'ix', ['c2'], { isUnique: true }) }],
		expect: 'conflict',
	},
	{
		name: 'create_fk ∥ drop of a plain index on the referenced column commutes',
		a: [build('create_fk')],
		b: [S.dropIndex('t2', 'ix', ['c2'])],
		expect: 'commute',
	},
	{
		name: 'create_index on both branches conflicts',
		a: [build('create_index')],
		b: [build('create_index')],
		expect: 'conflict',
	},
	{
		name: 'alter_check on both branches commutes, because its SQL is idempotent',
		a: [build('alter_check')],
		b: [build('alter_check')],
		expect: 'commute',
	},
	{
		name: 'create_enum ∥ add_column of that enum type conflicts',
		a: [build('create_enum')],
		b: [
			{
				type: 'add_column',
				column: col('s', 't', 'c2', { type: 'e', typeSchema: 's' }),
			},
		],
		expect: 'conflict',
	},
	{
		name: 'create_role ∥ create_policy for that role conflicts',
		a: [build('create_role')],
		b: [{ type: 'create_policy', policy: policy('s', 't', 'pol2', ['r']) }],
		expect: 'conflict',
	},
	{
		name: 'two drops of different enums commute',
		a: [build('drop_enum', 'a_')],
		b: [build('drop_enum', 'b_')],
		expect: 'commute',
	},
	{
		name: 'move_table ∥ create_index on that table conflicts',
		a: [build('move_table')],
		b: [build('create_index')],
		expect: 'conflict',
	},
	{
		name: 'an index rename over c ∥ a column drop of c conflicts through the read',
		a: [build('rename_index')],
		b: [{ type: 'drop_column', column: col('s', 't', 'c1') }],
		expect: 'conflict',
	},
];

describe('footprint commutativity — curated scenarios (cockroach)', () => {
	test.each(cases)('$name', ({ a, b, expect: want }) => {
		expect(conflicts(a, b)).toBe(want === 'conflict');
	});
});

describe('footprint commutativity — invariants over the catalog', () => {
	const catalog = rows();
	const types = Object.keys(catalog);
	const statements = types.map((type) => catalog[type].statement);

	test('the verdict does not depend on the order of the branches', () => {
		for (let i = 0; i < statements.length; i++) {
			for (let j = 0; j < statements.length; j++) {
				expect(conflicts([statements[i]], [statements[j]]), `${types[i]} ∥ ${types[j]}`).toBe(
					conflicts([statements[j]], [statements[i]]),
				);
			}
		}
	});

	test('a statement conflicts with itself only when its SQL is not idempotent', () => {
		for (const [idx, type] of types.entries()) {
			const [footprint] = footprintsOfStatements([statements[idx]]);
			expect(conflicts([statements[idx]], [structuredClone(statements[idx])]), type).toBe(
				footprint.sqlHash === undefined,
			);
		}
	});

	test('a drop of a column conflicts with every statement that reads the column', () => {
		const drop: JsonStatement = { type: 'drop_column', column: col('s', 't', 'c1') };
		const [dropFootprint] = footprintsOfStatements([drop]);
		const readers = types.filter((type) => {
			const [footprint] = footprintsOfStatements([catalog[type].statement]);
			return footprint.writes.some((node) => node.startsWith('e|col|'));
		});
		expect(readers.length).toBeGreaterThan(0);
		for (const type of readers) {
			expect(conflicts([drop], [catalog[type].statement]), type).toBe(true);
		}
		expect(dropFootprint.writes.some((node) => node.startsWith('e|col|'))).toBe(true);
	});
});
