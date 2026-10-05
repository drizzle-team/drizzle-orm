import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { describe, expect, test } from 'vitest';

// Curated regression scenarios for the facet commutativity model. Each asserts
// the verdict the model must produce; several encode bugs the facet model fixed
// vs the legacy conflict-list model. Facet is Postgres's default, so we call the
// engine directly.

const col = (schema: string, table: string, name: string, extra: Record<string, unknown> = {}) =>
	({
		schema,
		table,
		name,
		type: 'varchar',
		options: null,
		typeSchema: 'pg_catalog',
		notNull: false,
		dimensions: 0,
		default: null,
		generated: null,
		identity: null,
		...extra,
	}) as any;

const index = (schema: string, table: string, name: string, columns: string[]) =>
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

const S = {
	renameTable: (schema: string, from: string, to: string) => ({ type: 'rename_table', schema, from, to }) as any,
	moveTable: (name: string, from: string, to: string) => ({ type: 'move_table', name, from, to }) as any,
	dropTable: (schema: string, name: string) =>
		({ type: 'drop_table', table: { schema, name, isRlsEnabled: false }, key: `${schema}.${name}` }) as any,
	addColumn: (schema: string, table: string, name: string, extra: Record<string, unknown> = {}) =>
		({ type: 'add_column', column: col(schema, table, name, extra), isPK: false, isCompositePK: false }) as any,
	dropColumn: (schema: string, table: string, name: string) =>
		({ type: 'drop_column', column: col(schema, table, name) }) as any,
	renameColumn: (schema: string, table: string, from: string, to: string) =>
		({ type: 'rename_column', from: col(schema, table, from), to: col(schema, table, to) }) as any,
	// `change` holds the changed properties of the column, as the diff reports them.
	alterColumn: (
		schema: string,
		table: string,
		name: string,
		extra: Record<string, unknown> = {},
		change: Record<string, unknown> = { notNull: { from: false, to: true } },
	) => ({ type: 'alter_column', to: col(schema, table, name, extra), diff: { schema, table, name, ...change } }) as any,
	recreateColumn: (schema: string, table: string, name: string) =>
		({ type: 'recreate_column', diff: { schema, table, name } }) as any,
	createIndex: (schema: string, table: string, name: string, cols: string[]) =>
		({ type: 'create_index', index: index(schema, table, name, cols) }) as any,
	dropIndex: (schema: string, table: string, name: string, cols: string[]) =>
		({ type: 'drop_index', index: index(schema, table, name, cols) }) as any,
	renameIndex: (schema: string, table: string, from: string, to: string, columns: string[] = []) =>
		({ type: 'rename_index', schema, table, from, to, columns }) as any,
	addUnique: (schema: string, table: string, name: string, cols: string[]) =>
		({
			type: 'add_unique',
			unique: { schema, table, name, nameExplicit: true, columns: cols, nullsNotDistinct: false },
		}) as any,
	alterUnique: (schema: string, table: string, name: string, cols: string[]) =>
		({
			type: 'alter_unique',
			diff: { schema, table, name, $left: { columns: cols }, $right: { columns: cols } },
		}) as any,
	addCheck: (schema: string, table: string, name: string, cols: string[]) =>
		({
			type: 'add_check',
			check: { schema, table, name, value: cols.map((c) => `${c} > 0`).join(' and ') },
			columns: cols,
		}) as any,
	dropCheck: (schema: string, table: string, name: string, cols: string[]) =>
		({
			type: 'drop_check',
			check: { schema, table, name, value: cols.map((c) => `${c} > 0`).join(' and ') },
			columns: cols,
		}) as any,
	alterCheck: (schema: string, table: string, name: string, cols: string[]) =>
		({ type: 'alter_check', diff: { schema, table, name }, newColumns: cols, oldColumns: cols }) as any,
	renameConstraint: (schema: string, table: string, from: string, to: string, cols: string[]) =>
		({ type: 'rename_constraint', entityType: 'uniques', schema, table, from, to, columns: cols }) as any,
	addPk: (schema: string, table: string, cols: string[]) =>
		({ type: 'add_pk', pk: { schema, table, name: `${table}_pkey`, nameExplicit: false, columns: cols } }) as any,
	createFk: (
		schema: string,
		table: string,
		name: string,
		cols: string[],
		schemaTo: string,
		tableTo: string,
		colsTo: string[],
	) =>
		({
			type: 'create_fk',
			fk: {
				schema,
				table,
				name,
				nameExplicit: true,
				columns: cols,
				schemaTo,
				tableTo,
				columnsTo: colsTo,
				onUpdate: null,
				onDelete: null,
			},
		}) as any,
	createTable: (schema: string, name: string, columns: unknown[] = []) =>
		({ type: 'create_table', table: { schema, name, isRlsEnabled: false, columns } }) as any,
	dropEnum: (schema: string, name: string) =>
		({ type: 'drop_enum', enum: { schema, name, values: ['a', 'b'] } }) as any,
	renameEnum: (schema: string, from: string, to: string) => ({ type: 'rename_enum', schema, from, to }) as any,
	moveEnum: (name: string, from: string, to: string) =>
		({ type: 'move_enum', from: { schema: from, name }, to: { schema: to, name } }) as any,
	// `columns` are the columns of the enum type that the statement converts.
	recreateEnum: (schema: string, name: string, columns: unknown[] = []) =>
		({ type: 'recreate_enum', to: { schema, name, values: ['a'] }, columns }) as any,
	dropSchema: (name: string) => ({ type: 'drop_schema', name }) as any,
	alterRls: (schema: string, table: string, on: boolean) =>
		({ type: 'alter_rls', schema, name: table, isRlsEnabled: on }) as any,
	grant: (schema: string, table: string, grantee: string, type: string) =>
		({
			type: 'grant_privilege',
			privilege: { schema, table, grantee, grantor: 'admin', type, isGrantable: false },
		}) as any,
	createPolicy: (schema: string, table: string, name: string) =>
		({
			type: 'create_policy',
			policy: { schema, table, name, as: 'PERMISSIVE', for: 'ALL', roles: ['public'], using: null, withCheck: null },
		}) as any,
};

async function conflicts(a: JsonStatement[], b: JsonStatement[]): Promise<boolean> {
	return !!(await postgresCommutativity.getReasonsFromStatements(a, b));
}

type Case = { name: string; a: JsonStatement[]; b: JsonStatement[]; expect: 'conflict' | 'commute' };

const cases: Case[] = [
	// rename/move an object CONFLICTS with any statement that names it: replaying
	// `RENAME users→people; ADD/INDEX ... ON users` fails, so they are not
	// order-independent and must not be reported as commutative.
	{
		name: 'rename_table ∥ create_index (references old name) conflict',
		a: [S.renameTable('public', 'users', 'people')],
		b: [S.createIndex('public', 'users', 'ix', ['name'])],
		expect: 'conflict',
	},
	{
		name: 'move_table ∥ create_index (references old name) conflict',
		a: [S.moveTable('users', 'public', 'app')],
		b: [S.createIndex('public', 'users', 'ix', ['name'])],
		expect: 'conflict',
	},
	{
		name: 'rename_table ∥ add_column (references old name) conflict',
		a: [S.renameTable('public', 'users', 'people')],
		b: [S.addColumn('public', 'users', 'email')],
		expect: 'conflict',
	},
	{
		name: 'move_table ∥ add_column (references old name) conflict',
		a: [S.moveTable('users', 'public', 'app')],
		b: [S.addColumn('public', 'users', 'email')],
		expect: 'conflict',
	},
	{
		name: 'rename_column ∥ create_index over old name conflict',
		a: [S.renameColumn('public', 'users', 'name', 'full')],
		b: [S.createIndex('public', 'users', 'ix', ['name'])],
		expect: 'conflict',
	},

	// drops dominate the subtree
	{
		name: 'drop_table ∥ create_index (same table) conflict',
		a: [S.dropTable('public', 'users')],
		b: [S.createIndex('public', 'users', 'ix', ['name'])],
		expect: 'conflict',
	},
	{
		name: 'drop_table ∥ rename_index (same table) conflict',
		a: [S.dropTable('public', 'users')],
		b: [S.renameIndex('public', 'users', 'ix', 'ix2')],
		expect: 'conflict',
	},
	{
		name: 'drop_table ∥ alter_rls (same table) conflict',
		a: [S.dropTable('public', 'users')],
		b: [S.alterRls('public', 'users', true)],
		expect: 'conflict',
	},
	{
		name: 'drop_schema ∥ add_column (in schema) conflict',
		a: [S.dropSchema('public')],
		b: [S.addColumn('public', 'users', 'email')],
		expect: 'conflict',
	},

	// cross-references: dropping the referenced resource conflicts
	{
		name: 'drop_column c ∥ create_index over c conflict',
		a: [S.dropColumn('public', 'users', 'name')],
		b: [S.createIndex('public', 'users', 'ix', ['name'])],
		expect: 'conflict',
	},
	{
		name: 'add_pk over c ∥ drop_column c conflict',
		a: [S.addPk('public', 'users', ['id'])],
		b: [S.dropColumn('public', 'users', 'id')],
		expect: 'conflict',
	},
	{
		name: 'create_fk ∥ drop_table (fk target) conflict',
		a: [S.createFk('public', 'orders', 'fk', ['uid'], 'public', 'users', ['id'])],
		b: [S.dropTable('public', 'users')],
		expect: 'conflict',
	},
	{
		name: 'create_fk ∥ drop_column (target col) conflict',
		a: [S.createFk('public', 'orders', 'fk', ['uid'], 'public', 'users', ['id'])],
		b: [S.dropColumn('public', 'users', 'id')],
		expect: 'conflict',
	},
	{
		name: 'add_column(enum) ∥ drop_enum (that enum) conflict',
		a: [S.addColumn('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' })],
		b: [S.dropEnum('public', 'user_role')],
		expect: 'conflict',
	},

	// a new table with a column of an enum type names the type in its SQL
	{
		name: 'create_table(enum column) ∥ rename_enum (that enum) conflict',
		a: [
			S.createTable('public', 'staff', [col('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' })]),
		],
		b: [S.renameEnum('public', 'user_role', 'staff_role')],
		expect: 'conflict',
	},
	{
		name: 'create_table(enum column) ∥ move_enum (that enum) conflict',
		a: [
			S.createTable('public', 'staff', [col('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' })]),
		],
		b: [S.moveEnum('user_role', 'public', 'app')],
		expect: 'conflict',
	},
	{
		name: 'create_table(enum column) ∥ drop_enum (that enum) conflict',
		a: [
			S.createTable('public', 'staff', [col('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' })]),
		],
		b: [S.dropEnum('public', 'user_role')],
		expect: 'conflict',
	},
	{
		name: 'create_table(enum column) ∥ rename_enum (other enum) commute',
		a: [
			S.createTable('public', 'staff', [col('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' })]),
		],
		b: [S.renameEnum('public', 'mood', 'feeling')],
		expect: 'commute',
	},

	// recreate_enum drops and creates the type, and it converts every column of that type by name
	{
		name: 'recreate_enum ∥ create_table (uses the enum) conflict',
		a: [S.recreateEnum('public', 'user_role')],
		b: [
			S.createTable('public', 'staff', [col('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' })]),
		],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum ∥ add_column (uses the enum) conflict',
		a: [S.recreateEnum('public', 'user_role')],
		b: [S.addColumn('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' })],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum ∥ alter_column (changes a column to the enum type) conflict',
		a: [S.recreateEnum('public', 'user_role')],
		b: [S.alterColumn('public', 'staff', 'role', { type: 'user_role', typeSchema: 'public' }, {
			type: { from: 'varchar', to: 'user_role' },
		})],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum(converts c) ∥ rename_column c conflict',
		a: [
			S.recreateEnum('public', 'user_role', [
				col('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }),
			]),
		],
		b: [S.renameColumn('public', 'users', 'role', 'position')],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum(converts c) ∥ drop_column c conflict',
		a: [
			S.recreateEnum('public', 'user_role', [
				col('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }),
			]),
		],
		b: [S.dropColumn('public', 'users', 'role')],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum(converts c) ∥ rename_table (table of c) conflict',
		a: [
			S.recreateEnum('public', 'user_role', [
				col('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }),
			]),
		],
		b: [S.renameTable('public', 'users', 'people')],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum(converts c) ∥ move_table (table of c) conflict',
		a: [
			S.recreateEnum('public', 'user_role', [
				col('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }),
			]),
		],
		b: [S.moveTable('users', 'public', 'app')],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum(converts c) ∥ drop_table (table of c) conflict',
		a: [
			S.recreateEnum('public', 'user_role', [
				col('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }),
			]),
		],
		b: [S.dropTable('public', 'users')],
		expect: 'conflict',
	},
	{
		name: 'recreate_enum(converts c) ∥ add_column d (unrelated) commute',
		a: [
			S.recreateEnum('public', 'user_role', [
				col('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }),
			]),
		],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},

	// alter_column claims each property that its SQL changes or needs
	{
		name: 'alter_column c NOT NULL ∥ alter_column c default commute',
		a: [S.alterColumn('public', 'users', 'c')],
		b: [S.alterColumn('public', 'users', 'c', {}, { default: { from: null, to: "'x'" } })],
		expect: 'commute',
	},
	{
		name: 'alter_column c NOT NULL ∥ alter_column c type commute',
		a: [S.alterColumn('public', 'users', 'c')],
		b: [S.alterColumn('public', 'users', 'c', { type: 'text' }, { type: { from: 'varchar', to: 'text' } })],
		expect: 'commute',
	},
	{
		name: 'alter_column c default ∥ alter_column c default conflict',
		a: [S.alterColumn('public', 'users', 'c', {}, { default: { from: null, to: "'x'" } })],
		b: [S.alterColumn('public', 'users', 'c', {}, { default: { from: null, to: "'y'" } })],
		expect: 'conflict',
	},
	{
		name: 'alter_column c type ∥ alter_column c default (the type change rewrites it) conflict',
		a: [S.alterColumn('public', 'users', 'c', { type: 'integer' }, { type: { from: 'varchar', to: 'integer' } })],
		b: [S.alterColumn('public', 'users', 'c', {}, { default: { from: null, to: "'5'" } })],
		expect: 'conflict',
	},
	{
		name: 'alter_column c NOT NULL ∥ alter_column c identity (it needs NOT NULL) conflict',
		a: [S.alterColumn('public', 'users', 'c', {}, { notNull: { from: true, to: false } })],
		b: [S.alterColumn('public', 'users', 'c', {}, { identity: { from: null, to: { name: 'c_seq' } } })],
		expect: 'conflict',
	},
	{
		name: 'alter_column c NOT NULL ∥ rename_column c conflict',
		a: [S.alterColumn('public', 'users', 'c')],
		b: [S.renameColumn('public', 'users', 'c', 'd')],
		expect: 'conflict',
	},
	{
		name: 'alter_column(enum column) NOT NULL ∥ rename_enum commute',
		a: [S.alterColumn('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' })],
		b: [S.renameEnum('public', 'user_role', 'staff_role')],
		expect: 'commute',
	},
	{
		name: 'alter_column(enum column) NOT NULL ∥ move_enum commute',
		a: [S.alterColumn('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' })],
		b: [S.moveEnum('user_role', 'public', 'app')],
		expect: 'commute',
	},
	{
		name: 'alter_column(enum column) default ∥ rename_enum conflict',
		a: [S.alterColumn('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }, {
			default: { from: null, to: "'a'" },
		})],
		b: [S.renameEnum('public', 'user_role', 'staff_role')],
		expect: 'conflict',
	},
	{
		name: 'alter_column(to an enum type) ∥ move_enum conflict',
		a: [S.alterColumn('public', 'users', 'role', { type: 'user_role', typeSchema: 'public' }, {
			type: { from: 'varchar', to: 'user_role' },
		})],
		b: [S.moveEnum('user_role', 'public', 'app')],
		expect: 'conflict',
	},

	// a privilege statement claims its table, its grantee and its privilege type
	{
		name: 'grant SELECT ∥ grant INSERT (same table and role) commute',
		a: [S.grant('public', 'users', 'r', 'SELECT')],
		b: [S.grant('public', 'users', 'r', 'INSERT')],
		expect: 'commute',
	},
	{
		name: 'grant SELECT to r ∥ grant SELECT to r2 commute',
		a: [S.grant('public', 'users', 'r', 'SELECT')],
		b: [S.grant('public', 'users', 'r2', 'SELECT')],
		expect: 'commute',
	},
	{
		name: 'grant SELECT ∥ revoke SELECT (same table and role) conflict',
		a: [S.grant('public', 'users', 'r', 'SELECT')],
		b: [{ ...S.grant('public', 'users', 'r', 'SELECT'), type: 'revoke_privilege' }],
		expect: 'conflict',
	},
	{
		name: 'grant ALL ∥ revoke SELECT (ALL holds SELECT) conflict',
		a: [S.grant('public', 'users', 'r', 'ALL')],
		b: [{ ...S.grant('public', 'users', 'r', 'SELECT'), type: 'revoke_privilege' }],
		expect: 'conflict',
	},
	{
		name: 'grant by admin ∥ rename_role admin (GRANTED BY names it) conflict',
		a: [S.grant('public', 'users', 'r', 'SELECT')],
		b: [{ type: 'rename_role', from: { name: 'admin' }, to: { name: 'owner' } } as any],
		expect: 'conflict',
	},

	// granularity: distinct named children on the same table are independent
	{
		name: 'add_unique u1 ∥ add_unique u2 (diff names) commute',
		a: [S.addUnique('public', 'users', 'u1', ['a'])],
		b: [S.addUnique('public', 'users', 'u2', ['b'])],
		expect: 'commute',
	},
	{
		name: 'add_unique u1 ∥ add_unique u1 (same name) conflict',
		a: [S.addUnique('public', 'users', 'u1', ['a'])],
		b: [S.addUnique('public', 'users', 'u1', ['a'])],
		expect: 'conflict',
	},
	{
		name: 'add_column x ∥ add_column y (diff cols) commute',
		a: [S.addColumn('public', 'users', 'x')],
		b: [S.addColumn('public', 'users', 'y')],
		expect: 'commute',
	},
	{
		name: 'add_pk over c ∥ add_column d (diff col) commute',
		a: [S.addPk('public', 'users', ['id'])],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},
	{
		name: 'create_index a ∥ create_index b (diff idx) commute',
		a: [S.createIndex('public', 'users', 'ixa', ['a'])],
		b: [S.createIndex('public', 'users', 'ixb', ['b'])],
		expect: 'commute',
	},
	{
		name: 'create_index a ∥ drop_index a (same idx) conflict',
		a: [S.createIndex('public', 'users', 'ix', ['a'])],
		b: [S.dropIndex('public', 'users', 'ix', ['a'])],
		expect: 'conflict',
	},

	// table-level aspects are siblings, not the table itself
	{
		name: 'alter_rls ∥ add_column (same table) commute',
		a: [S.alterRls('public', 'users', true)],
		b: [S.addColumn('public', 'users', 'email')],
		expect: 'commute',
	},
	{
		name: 'alter_rls ∥ create_policy (same table) commute',
		a: [S.alterRls('public', 'users', true)],
		b: [S.createPolicy('public', 'users', 'p1')],
		expect: 'commute',
	},

	// renames occupy BOTH endpoints
	{
		name: 'rename_column c1->c2 ∥ add_column c3 commute',
		a: [S.renameColumn('public', 'users', 'c1', 'c2')],
		b: [S.addColumn('public', 'users', 'c3')],
		expect: 'commute',
	},
	{
		name: 'rename_column c1->c2 ∥ drop_column c1 (source) conflict',
		a: [S.renameColumn('public', 'users', 'c1', 'c2')],
		b: [S.dropColumn('public', 'users', 'c1')],
		expect: 'conflict',
	},
	{
		name: 'rename_column c1->c2 ∥ add_column c2 (target) conflict',
		a: [S.renameColumn('public', 'users', 'c1', 'c2')],
		b: [S.addColumn('public', 'users', 'c2')],
		expect: 'conflict',
	},
	{
		name: 'rename_table ∥ drop_table (same table) conflict',
		a: [S.renameTable('public', 'users', 'people')],
		b: [S.dropTable('public', 'users')],
		expect: 'conflict',
	},
	{
		name: 'rename_table ∥ rename_table (same table) conflict',
		a: [S.renameTable('public', 'users', 'people')],
		b: [S.renameTable('public', 'users', 'staff')],
		expect: 'conflict',
	},

	// existence vs identity: an existing index follows a column rename but is
	// cascaded away by a column drop — so drop conflicts, rename/alter commute
	{
		name: 'drop_column c ∥ drop_index over c (cascade) conflict',
		a: [S.dropColumn('public', 'users', 'c')],
		b: [S.dropIndex('public', 'users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'rename_column c ∥ drop_index over c (index follows) commute',
		a: [S.renameColumn('public', 'users', 'c', 'c2')],
		b: [S.dropIndex('public', 'users', 'ix', ['c'])],
		expect: 'commute',
	},
	{
		name: 'alter_column c ∥ drop_index over c commute',
		a: [S.alterColumn('public', 'users', 'c')],
		b: [S.dropIndex('public', 'users', 'ix', ['c'])],
		expect: 'commute',
	},
	{
		name: 'add_column c ∥ drop_index over c (col had to exist) conflict',
		a: [S.addColumn('public', 'users', 'c')],
		b: [S.dropIndex('public', 'users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'drop_column c ∥ rename_index over c (cascade) conflict',
		a: [S.dropColumn('public', 'users', 'c')],
		b: [S.renameIndex('public', 'users', 'ix', 'ix2', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'rename_column c ∥ rename_index over c (both follow) commute',
		a: [S.renameColumn('public', 'users', 'c', 'c2')],
		b: [S.renameIndex('public', 'users', 'ix', 'ix2', ['c'])],
		expect: 'commute',
	},
	// alter of a column does not break a name reference to it (fixes prior false positive)
	{
		name: 'alter_column c ∥ create_index over c commute',
		a: [S.alterColumn('public', 'users', 'c')],
		b: [S.createIndex('public', 'users', 'ix', ['c'])],
		expect: 'commute',
	},
	{
		name: 'rename_column c ∥ create_index over c (DDL names c) conflict',
		a: [S.renameColumn('public', 'users', 'c', 'c2')],
		b: [S.createIndex('public', 'users', 'ix', ['c'])],
		expect: 'conflict',
	},

	// checks: columns parsed from the expression get the same treatment as uniques
	{
		name: 'add_check(c) ∥ drop_column c (expr names c) conflict',
		a: [S.addCheck('public', 'users', 'ck', ['c'])],
		b: [S.dropColumn('public', 'users', 'c')],
		expect: 'conflict',
	},
	{
		name: 'add_check(c) ∥ rename_column c (expr names c) conflict',
		a: [S.addCheck('public', 'users', 'ck', ['c'])],
		b: [S.renameColumn('public', 'users', 'c', 'c2')],
		expect: 'conflict',
	},
	{
		name: 'drop_check(c) ∥ drop_column c (cascade) conflict',
		a: [S.dropCheck('public', 'users', 'ck', ['c'])],
		b: [S.dropColumn('public', 'users', 'c')],
		expect: 'conflict',
	},
	{
		name: 'drop_check(c) ∥ rename_column c (check follows) commute',
		a: [S.dropCheck('public', 'users', 'ck', ['c'])],
		b: [S.renameColumn('public', 'users', 'c', 'c2')],
		expect: 'commute',
	},
	{
		name: 'add_check(c) ∥ add_column d (unrelated col) commute',
		a: [S.addCheck('public', 'users', 'ck', ['c'])],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},

	// alter_unique = DROP old + ADD new: the ADD hardcodes columns, so rename/drop of one conflicts
	{
		name: 'alter_unique(c) ∥ rename_column c conflict',
		a: [S.alterUnique('public', 'users', 'uq', ['c'])],
		b: [S.renameColumn('public', 'users', 'c', 'c2')],
		expect: 'conflict',
	},
	{
		name: 'alter_unique(c) ∥ drop_column c conflict',
		a: [S.alterUnique('public', 'users', 'uq', ['c'])],
		b: [S.dropColumn('public', 'users', 'c')],
		expect: 'conflict',
	},
	{
		name: 'alter_unique(c) ∥ add_column d (unrelated col) commute',
		a: [S.alterUnique('public', 'users', 'uq', ['c'])],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},

	// alter_check = DROP old + ADD new; columns parsed from both expressions
	{
		name: 'alter_check(c) ∥ rename_column c conflict',
		a: [S.alterCheck('public', 'users', 'ck', ['c'])],
		b: [S.renameColumn('public', 'users', 'c', 'c2')],
		expect: 'conflict',
	},
	{
		name: 'alter_check(c) ∥ drop_column c conflict',
		a: [S.alterCheck('public', 'users', 'ck', ['c'])],
		b: [S.dropColumn('public', 'users', 'c')],
		expect: 'conflict',
	},
	{
		name: 'alter_check(c) ∥ add_column d (unrelated col) commute',
		a: [S.alterCheck('public', 'users', 'ck', ['c'])],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},

	// rename_constraint: renames the constraint (not the columns) — follows a column
	// rename but is cascaded by a column drop
	{
		name: 'rename_constraint(on c) ∥ drop_column c (cascade) conflict',
		a: [S.renameConstraint('public', 'users', 'uq', 'uq2', ['c'])],
		b: [S.dropColumn('public', 'users', 'c')],
		expect: 'conflict',
	},
	{
		name: 'rename_constraint(on c) ∥ rename_column c (follows) commute',
		a: [S.renameConstraint('public', 'users', 'uq', 'uq2', ['c'])],
		b: [S.renameColumn('public', 'users', 'c', 'c2')],
		expect: 'commute',
	},
	{
		name: 'rename_constraint(on c) ∥ add_column d (unrelated) commute',
		a: [S.renameConstraint('public', 'users', 'uq', 'uq2', ['c'])],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},

	// recreate_column = DROP + re-ADD: cascades the column's indexes/constraints,
	// so ops on them conflict; unrelated columns still commute
	{
		name: 'recreate_column c ∥ create_index over c conflict',
		a: [S.recreateColumn('public', 'users', 'c')],
		b: [S.createIndex('public', 'users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'recreate_column c ∥ drop_index over c conflict',
		a: [S.recreateColumn('public', 'users', 'c')],
		b: [S.dropIndex('public', 'users', 'ix', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'recreate_column c ∥ add_pk over c conflict',
		a: [S.recreateColumn('public', 'users', 'c')],
		b: [S.addPk('public', 'users', ['c'])],
		expect: 'conflict',
	},
	{
		name: 'recreate_column c ∥ add_column d (unrelated) commute',
		a: [S.recreateColumn('public', 'users', 'c')],
		b: [S.addColumn('public', 'users', 'd')],
		expect: 'commute',
	},
];

describe('facet commutativity — curated scenarios (postgres)', () => {
	test.each(cases)('$name', async ({ a, b, expect: want }) => {
		expect(await conflicts(a, b)).toBe(want === 'conflict');
	});
});
