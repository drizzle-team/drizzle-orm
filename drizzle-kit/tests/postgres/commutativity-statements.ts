import type { JsonStatement } from 'src/dialects/postgres/statements';

// Every statement targets the same table s.t (column c1), so the matrix shows the
// most overlap between statement types. The statements carry the fields that the
// SQL convertor reads, so that the ground-truth test can run them on a database.
const S = 's', T = 't', C = 'c1';

const col = (schema: string, table: string, name: string) =>
	({
		schema,
		table,
		name,
		type: 'varchar',
		typeSchema: 'pg_catalog',
		notNull: false,
		dimensions: 0,
		default: null,
		generated: null,
		identity: null,
	}) as any;
// A column of the enum type s.e. It has its own name, so that a base can hold it next to the varchar column c1.
const enumCol = { ...col(S, T, 'ce'), type: 'e', typeSchema: S };
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
const fk = (onDelete: string) => ({
	schema: S,
	table: T,
	name: 'fk',
	nameExplicit: true,
	columns: [C],
	schemaTo: S,
	tableTo: 't2',
	columnsTo: ['c2'],
	onUpdate: 'NO ACTION',
	onDelete,
});
const unique = { schema: S, table: T, name: 'uq', nameExplicit: true, columns: [C], nullsNotDistinct: false };
const check = (value: string) => ({ schema: S, table: T, name: 'ck', value });
const policy = {
	schema: S,
	table: T,
	name: 'pol',
	as: 'PERMISSIVE',
	for: 'ALL',
	roles: ['public'],
	using: null,
	withCheck: null,
};
const role = { name: 'r', inherit: true };

export function build(type: string): JsonStatement {
	switch (type) {
		case 'create_table':
			return {
				type,
				table: {
					schema: S,
					name: T,
					isRlsEnabled: false,
					columns: [col(S, T, 'id')],
					pk: null,
					uniques: [],
					checks: [],
					policies: [],
				},
			} as any;
		case 'create_table:enum':
			return {
				type: 'create_table',
				table: {
					schema: S,
					name: T,
					isRlsEnabled: false,
					columns: [col(S, T, 'id'), enumCol],
					pk: null,
					uniques: [],
					checks: [],
					policies: [],
				},
			} as any;
		case 'drop_table':
			return { type, table: { schema: S, name: T, isRlsEnabled: false, policies: [] }, key: `${S}.${T}` } as any;
		case 'rename_table':
			return { type, schema: S, from: T, to: 't_new' } as any;
		case 'move_table':
			return { type, name: T, from: S, to: 's_new' } as any;
		case 'add_column':
			return { type, column: col(S, T, C), isPK: false, isCompositePK: false } as any;
		case 'add_column:enum':
			return { type: 'add_column', column: enumCol, isPK: false, isCompositePK: false } as any;
		case 'drop_column':
			return { type, column: col(S, T, C) } as any;
		case 'alter_column':
			return {
				type,
				to: col(S, T, C),
				diff: { schema: S, table: T, name: C, notNull: { from: false, to: true } },
			} as any;
		case 'recreate_column':
			return { type, diff: { schema: S, table: T, name: C, $right: col(S, T, C) }, isPK: false } as any;
		case 'rename_column':
			return { type, from: col(S, T, C), to: col(S, T, 'c_new') } as any;
		case 'create_index':
			return { type, index: idx(S, T, 'ix', [C]) } as any;
		case 'drop_index':
			return { type, index: idx(S, T, 'ix', [C]) } as any;
		case 'recreate_index':
			return { type, index: idx(S, T, 'ix', [C]), diff: { schema: S, name: 'ix' }, shouldDrop: true } as any;
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
			return { type, fk: fk('NO ACTION'), diff: {} } as any;
		case 'recreate_fk':
			return { type, fk: fk('CASCADE'), diff: {} } as any;
		case 'drop_fk':
			return { type, fk: fk('NO ACTION') } as any;
		case 'add_unique':
			return { type, unique } as any;
		case 'drop_unique':
			return { type, unique } as any;
		case 'alter_unique':
			return {
				type,
				diff: { schema: S, table: T, name: 'uq', $left: unique, $right: { ...unique, nullsNotDistinct: true } },
			} as any;
		case 'add_check':
			return { type, check: check(`"${C}" <> ''`), columns: [C] } as any;
		case 'drop_check':
			return { type, check: check(`"${C}" <> ''`), columns: [C] } as any;
		case 'alter_check':
			return {
				type,
				diff: { schema: S, table: T, name: 'ck', $right: check(`"${C}" <> 'x'`) },
				newColumns: [C],
				oldColumns: [C],
			} as any;
		// One row for each constraint kind, because the SQL is the same and the claims differ.
		case 'rename_constraint:pks':
		case 'rename_constraint:uniques':
		case 'rename_constraint:checks':
		case 'rename_constraint:fks': {
			const entityType = type.split(':')[1] as 'pks' | 'uniques' | 'checks' | 'fks';
			const from = { pks: 't_pkey', uniques: 'uq', checks: 'ck', fks: 'fk' }[entityType];
			return {
				type: 'rename_constraint',
				entityType,
				schema: S,
				table: T,
				from,
				to: `${from}_new`,
				columns: [C],
			} as any;
		}
		case 'create_enum':
			return { type, enum: { schema: S, name: 'e', values: ['a', 'b'] } } as any;
		case 'drop_enum':
			return { type, enum: { schema: S, name: 'e', values: ['a', 'b'] } } as any;
		case 'rename_enum':
			return { type, schema: S, from: 'e', to: 'e_new' } as any;
		case 'alter_enum':
			return {
				type,
				to: { schema: S, name: 'e', values: ['a', 'b', 'c'] },
				diff: [{ type: 'added', value: 'c' }],
			} as any;
		case 'recreate_enum':
			return { type, to: { schema: S, name: 'e', values: ['b', 'a'] }, columns: [] } as any;
		// The enum has one column of its type, and the statement converts that column.
		case 'recreate_enum:column':
			return {
				type: 'recreate_enum',
				to: { schema: S, name: 'e', values: ['b', 'a'] },
				columns: [{ ...enumCol, default: { left: null, right: null } }],
			} as any;
		case 'move_enum':
			return { type, from: { schema: S, name: 'e' }, to: { schema: 's_new', name: 'e' } } as any;
		case 'create_sequence':
			return { type, sequence: { schema: S, name: 'sq' } } as any;
		case 'drop_sequence':
			return { type, sequence: { schema: S, name: 'sq' } } as any;
		case 'rename_sequence':
			return { type, from: { schema: S, name: 'sq' }, to: { schema: S, name: 'sq_new' } } as any;
		case 'alter_sequence':
			return { type, sequence: { schema: S, name: 'sq', incrementBy: '2' } } as any;
		case 'move_sequence':
			return { type, from: { schema: S, name: 'sq' }, to: { schema: 's_new', name: 'sq' } } as any;
		case 'create_view':
			return { type, view: { schema: S, name: 'vw', definition: 'SELECT 1 AS "x"' } } as any;
		case 'drop_view':
			return { type, view: { schema: S, name: 'vw' } } as any;
		case 'rename_view':
			return { type, from: { schema: S, name: 'vw' }, to: { schema: S, name: 'vw_new' } } as any;
		case 'alter_view':
			return {
				type,
				view: { schema: S, name: 'vw' },
				diff: { with: { from: {}, to: { securityBarrier: true } } },
			} as any;
		case 'move_view':
			return { type, fromSchema: S, toSchema: 's_new', view: { schema: 's_new', name: 'vw' } } as any;
		case 'create_schema':
			return { type, name: S } as any;
		case 'drop_schema':
			return { type, name: S } as any;
		case 'rename_schema':
			return { type, from: { name: S }, to: { name: 's_new' } } as any;
		case 'create_policy':
			return { type, policy, diff: {} } as any;
		case 'alter_policy':
			return { type, policy: { ...policy, using: 'true' }, diff: {} } as any;
		case 'recreate_policy':
			return { type, policy: { ...policy, as: 'RESTRICTIVE' }, diff: {} } as any;
		case 'drop_policy':
			return { type, policy } as any;
		case 'rename_policy':
			return { type, from: { schema: S, table: T, name: 'pol' }, to: { schema: S, table: T, name: 'pol_new' } } as any;
		case 'alter_rls':
			return { type, schema: S, name: T, isRlsEnabled: true } as any;
		case 'create_role':
			return { type, role } as any;
		case 'alter_role':
			return { type, role, diff: { createDb: { from: false, to: true } } } as any;
		case 'drop_role':
			return { type, role } as any;
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
