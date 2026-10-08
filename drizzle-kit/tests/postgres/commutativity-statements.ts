import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Privilege,
	UniqueConstraint,
} from 'src/dialects/postgres/ddl';
import type { JsonRenameConstraint, JsonStatement } from 'src/dialects/postgres/statements';

// The parts of a statement. A part holds the fields of its entity that a snapshot stores, so it has no
// `entityType`.
export const col = (schema: string, table: string, name: string, extra: Partial<Column> = {}) =>
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
		...extra,
	}) as Column;
export const idx = (schema: string, table: string, name: string, columns: string[]) =>
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
	}) as Index;
export const pk = (schema: string, table: string, columns: string[]) =>
	({ schema, table, name: `${table}_pkey`, nameExplicit: false, columns }) as PrimaryKey;
export const fk = (
	schema: string,
	table: string,
	name: string,
	columns: string[],
	schemaTo: string,
	tableTo: string,
	columnsTo: string[],
	onDelete: ForeignKey['onDelete'] = 'NO ACTION',
) =>
	({
		schema,
		table,
		name,
		nameExplicit: true,
		columns,
		schemaTo,
		tableTo,
		columnsTo,
		onUpdate: 'NO ACTION',
		onDelete,
	}) as ForeignKey;
export const unique = (schema: string, table: string, name: string, columns: string[]) =>
	({ schema, table, name, nameExplicit: true, columns, nullsNotDistinct: false }) as UniqueConstraint;
export const check = (schema: string, table: string, name: string, value: string) =>
	({ schema, table, name, value }) as CheckConstraint;
export const policy = (schema: string, table: string, name: string, roles = ['public']) =>
	({ schema, table, name, as: 'PERMISSIVE', for: 'ALL', roles, using: null, withCheck: null }) as Policy;
export const privilege = (
	schema: string,
	table: string,
	grantee: string,
	type: Privilege['type'],
	grantor = 'postgres',
) => ({ schema, table, grantee, grantor, type, isGrantable: false }) as Privilege;

// `change` is the changed property of the column, as the diff reports it.
const alterColumn = (from: Column, change: Record<string, { from: unknown; to: unknown }>, flags = {}) => {
	const to = { ...from, ...Object.fromEntries(Object.entries(change).map(([key, value]) => [key, value.to])) };
	return {
		type: 'alter_column',
		to,
		diff: { schema: from.schema, table: from.table, name: from.name, ...change, $left: from, $right: to },
		isEnum: false,
		wasEnum: false,
		wasSerial: false,
		toSerial: false,
		...flags,
	} as any;
};

// An object that must exist before the SQL of a row can run.
export type NeededObject =
	| 'schema'
	| 'targetSchema'
	| 'table'
	| 'rls'
	| 'column'
	| 'referencedTable'
	| 'tableWithUnique'
	| 'index'
	| 'pk'
	| 'fk'
	| 'unique'
	| 'check'
	| 'enum'
	| 'enumColumn'
	| 'sequence'
	| 'view'
	| 'policy'
	| 'role'
	| 'privilege';

const onTable = ['schema', 'table'] as const;
const onColumn = [...onTable, 'column'] as const;

type Row = {
	statement: JsonStatement;
	// The rows of one family are neighbors, and the visualizer page gives them one color.
	family: string;
	needs: readonly NeededObject[];
	// The statement creates the object that it names.
	isCreate?: boolean;
};

// One row for each statement type, and one more for each variant of a type that has other claims.
// Every statement targets the same table s.t (column c1), so the matrix shows the most overlap between
// statement types. The statements carry the fields that the SQL convertor reads, so that the ground-truth
// test can run them on a database. Every object that a row creates, changes or drops has a name that
// starts with `prefix`. The grantor `postgres` and the policy role `public` are the same for every prefix.
export const rows = (prefix = ''): Record<string, Row> => {
	const named = (name: string) => prefix + name;
	const schema = named('s');
	const targetSchema = named('s_new');
	const table = named('t');
	const column = named('c1');
	const referencedTable = named('t2');
	const referencedColumn = named('c2');
	// A table whose column `c3` has a unique constraint and no primary key.
	const tableWithUnique = named('t3');
	const uniqueColumn = named('c3');
	const index = named('ix');
	const enumName = named('e');
	const sequence = named('sq');
	const view = named('vw');
	const role = named('r');

	// A column of the enum type `e`. It has its own name, so that one table can hold it next to the varchar
	// column `c1`.
	const enumColumn = col(schema, table, named('ce'), { type: enumName, typeSchema: schema });
	const primaryKey = pk(schema, table, [column]);
	const foreignKey = (onDelete: ForeignKey['onDelete']) =>
		fk(schema, table, named('fk'), [column], schema, referencedTable, [referencedColumn], onDelete);
	const uniqueConstraint = unique(schema, table, named('uq'), [column]);
	const checkConstraint = check(schema, table, named('ck'), `"${column}" <> ''`);
	const tablePolicy = policy(schema, table, named('pol'));
	const select = privilege(schema, table, role, 'SELECT');

	const createTable = (name: string, columns: Column[]) =>
		({
			type: 'create_table',
			table: { schema, name, isRlsEnabled: false, columns, pk: null, uniques: [], checks: [], policies: [] },
		}) as any;
	// One row for each constraint kind, because the SQL is the same and the claims differ.
	const renameConstraint = (
		entityType: JsonRenameConstraint['entityType'],
		from: string,
		needs: readonly NeededObject[],
	): Row => ({
		family: 'constraint',
		needs: [...onColumn, ...needs],
		statement: { type: 'rename_constraint', entityType, schema, table, from, to: `${from}_new`, columns: [column] },
	});

	return {
		create_table: {
			family: 'table',
			needs: ['schema'],
			isCreate: true,
			statement: createTable(table, [col(schema, table, named('id'))]),
		},
		'create_table:enum': {
			family: 'table',
			needs: ['schema', 'enum'],
			isCreate: true,
			statement: createTable(table, [col(schema, table, named('id')), enumColumn]),
		},
		// A table with the name of the index `ix`. Postgres keeps both names in one namespace.
		'create_table:ix': {
			family: 'table',
			needs: ['schema'],
			isCreate: true,
			statement: createTable(index, [col(schema, index, named('id'))]),
		},
		drop_table: {
			family: 'table',
			needs: onTable,
			statement: {
				type: 'drop_table',
				table: { schema, name: table, isRlsEnabled: false, policies: [] },
				key: `${schema}.${table}`,
			} as any,
		},
		rename_table: {
			family: 'table',
			needs: onTable,
			statement: { type: 'rename_table', schema, from: table, to: named('t_new') },
		},
		move_table: {
			family: 'table',
			needs: [...onTable, 'targetSchema'],
			statement: { type: 'move_table', name: table, from: schema, to: targetSchema, relations: [] },
		},

		add_column: {
			family: 'column',
			needs: onTable,
			isCreate: true,
			statement: { type: 'add_column', column: col(schema, table, column), isPK: false, isCompositePK: false },
		},
		'add_column:enum': {
			family: 'column',
			needs: [...onTable, 'enum'],
			isCreate: true,
			statement: { type: 'add_column', column: enumColumn, isPK: false, isCompositePK: false },
		},
		drop_column: {
			family: 'column',
			needs: onColumn,
			statement: { type: 'drop_column', column: col(schema, table, column) },
		},
		alter_column: {
			family: 'column',
			needs: onColumn,
			statement: alterColumn(col(schema, table, column), { notNull: { from: false, to: true } }),
		},
		'alter_column:default': {
			family: 'column',
			needs: onColumn,
			statement: alterColumn(col(schema, table, column), { default: { from: null, to: "'x'" } }),
		},
		'alter_column:type': {
			family: 'column',
			needs: onColumn,
			statement: alterColumn(col(schema, table, column), { type: { from: 'varchar', to: 'text' } }),
		},
		'alter_column:enum_not_null': {
			family: 'column',
			needs: [...onTable, 'enum', 'enumColumn'],
			statement: alterColumn(enumColumn, { notNull: { from: false, to: true } }, { isEnum: true }),
		},
		'alter_column:enum_default': {
			family: 'column',
			needs: [...onTable, 'enum', 'enumColumn'],
			statement: alterColumn(enumColumn, { default: { from: null, to: "'a'" } }, { isEnum: true }),
		},
		recreate_column: {
			family: 'column',
			needs: onColumn,
			statement: {
				type: 'recreate_column',
				diff: { schema, table, name: column, $right: col(schema, table, column) },
				isPK: false,
			} as any,
		},
		'recreate_column:enum': {
			family: 'column',
			needs: [...onTable, 'enum', 'enumColumn'],
			statement: {
				type: 'recreate_column',
				diff: { schema, table, name: enumColumn.name, $right: enumColumn },
				isPK: false,
			} as any,
		},
		rename_column: {
			family: 'column',
			needs: onColumn,
			statement: {
				type: 'rename_column',
				from: col(schema, table, column),
				to: col(schema, table, named('c_new')),
			},
		},

		create_index: {
			family: 'index',
			needs: onColumn,
			isCreate: true,
			statement: { type: 'create_index', index: idx(schema, table, index, [column]) },
		},
		drop_index: {
			family: 'index',
			needs: [...onColumn, 'index'],
			statement: { type: 'drop_index', index: idx(schema, table, index, [column]) },
		},
		rename_index: {
			family: 'index',
			needs: [...onColumn, 'index'],
			statement: { type: 'rename_index', schema, table, from: index, to: named('ix_new'), columns: [column] },
		},
		recreate_index: {
			family: 'index',
			needs: [...onColumn, 'index'],
			statement: {
				type: 'recreate_index',
				index: idx(schema, table, index, [column]),
				diff: { schema, name: index, $left: idx(schema, table, index, [column]) },
				shouldDrop: true,
			} as any,
		},

		add_pk: {
			family: 'pk',
			needs: onColumn,
			isCreate: true,
			statement: { type: 'add_pk', pk: primaryKey },
		},
		drop_pk: {
			family: 'pk',
			needs: [...onColumn, 'pk'],
			statement: { type: 'drop_pk', pk: primaryKey },
		},
		// The primary key that the foreign key `fk` references.
		'drop_pk:target': {
			family: 'pk',
			needs: ['schema', 'referencedTable'],
			statement: { type: 'drop_pk', pk: pk(schema, referencedTable, [referencedColumn]) },
		},
		alter_pk: {
			family: 'pk',
			needs: [...onColumn, 'pk'],
			statement: { type: 'alter_pk', pk: primaryKey, diff: { schema, table } } as any,
		},

		create_fk: {
			family: 'fk',
			needs: [...onColumn, 'referencedTable'],
			isCreate: true,
			statement: { type: 'create_fk', fk: foreignKey('NO ACTION') },
		},
		// A foreign key that references the unique constraint of the table `t3`.
		'create_fk:unique': {
			family: 'fk',
			needs: [...onColumn, 'tableWithUnique'],
			isCreate: true,
			statement: {
				type: 'create_fk',
				fk: fk(schema, table, named('fk'), [column], schema, tableWithUnique, [uniqueColumn]),
			},
		},
		drop_fk: {
			family: 'fk',
			needs: [...onColumn, 'referencedTable', 'fk'],
			statement: { type: 'drop_fk', fk: foreignKey('NO ACTION') },
		},
		recreate_fk: {
			family: 'fk',
			needs: [...onColumn, 'referencedTable', 'fk'],
			statement: { type: 'recreate_fk', fk: foreignKey('CASCADE'), diff: {} } as any,
		},

		add_unique: {
			family: 'unique',
			needs: onColumn,
			isCreate: true,
			statement: { type: 'add_unique', unique: uniqueConstraint },
		},
		drop_unique: {
			family: 'unique',
			needs: [...onColumn, 'unique'],
			statement: { type: 'drop_unique', unique: uniqueConstraint },
		},
		// The unique constraint that the foreign key of `create_fk:unique` references.
		'drop_unique:target': {
			family: 'unique',
			needs: ['schema', 'tableWithUnique'],
			statement: {
				type: 'drop_unique',
				unique: unique(schema, tableWithUnique, `${tableWithUnique}_${uniqueColumn}_key`, [uniqueColumn]),
			},
		},
		alter_unique: {
			family: 'unique',
			needs: [...onColumn, 'unique'],
			statement: {
				type: 'alter_unique',
				diff: {
					schema,
					table,
					name: uniqueConstraint.name,
					$left: uniqueConstraint,
					$right: { ...uniqueConstraint, nullsNotDistinct: true },
				},
			} as any,
		},

		add_check: {
			family: 'check',
			needs: onColumn,
			isCreate: true,
			statement: { type: 'add_check', check: checkConstraint, columns: [column] },
		},
		// A check constraint with the name of the unique constraint `uq`. A table has one namespace for both.
		'add_check:uq': {
			family: 'check',
			needs: onColumn,
			isCreate: true,
			statement: {
				type: 'add_check',
				check: { ...checkConstraint, name: uniqueConstraint.name },
				columns: [column],
			},
		},
		drop_check: {
			family: 'check',
			needs: [...onColumn, 'check'],
			statement: { type: 'drop_check', check: checkConstraint, columns: [column] },
		},
		alter_check: {
			family: 'check',
			needs: [...onColumn, 'check'],
			statement: {
				type: 'alter_check',
				diff: {
					schema,
					table,
					name: checkConstraint.name,
					$right: check(schema, table, checkConstraint.name, `"${column}" <> 'x'`),
				},
				newColumns: [column],
				oldColumns: [column],
			} as any,
		},

		'rename_constraint:pks': renameConstraint('pks', primaryKey.name, ['pk']),
		'rename_constraint:uniques': renameConstraint('uniques', uniqueConstraint.name, ['unique']),
		'rename_constraint:checks': renameConstraint('checks', checkConstraint.name, ['check']),
		'rename_constraint:fks': renameConstraint('fks', named('fk'), ['referencedTable', 'fk']),

		create_enum: {
			family: 'enum',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_enum', enum: { schema, name: enumName, values: ['a', 'b'] } } as any,
		},
		drop_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: { type: 'drop_enum', enum: { schema, name: enumName, values: ['a', 'b'] } } as any,
		},
		rename_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: { type: 'rename_enum', schema, from: enumName, to: named('e_new') },
		},
		alter_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: {
				type: 'alter_enum',
				to: { schema, name: enumName, values: ['a', 'b', 'c'] },
				diff: [{ type: 'added', value: 'c' }],
			} as any,
		},
		recreate_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: {
				type: 'recreate_enum',
				to: { schema, name: enumName, values: ['b', 'a'] },
				columns: [],
			} as any,
		},
		// The enum has one column of its type, and the statement converts that column.
		'recreate_enum:column': {
			family: 'enum',
			needs: [...onTable, 'enum', 'enumColumn'],
			statement: {
				type: 'recreate_enum',
				to: { schema, name: enumName, values: ['b', 'a'] },
				columns: [{ ...enumColumn, default: { left: null, right: null } }],
			} as any,
		},
		move_enum: {
			family: 'enum',
			needs: ['schema', 'targetSchema', 'enum'],
			statement: {
				type: 'move_enum',
				from: { schema, name: enumName },
				to: { schema: targetSchema, name: enumName },
			},
		},

		create_schema: {
			family: 'schema',
			needs: [],
			isCreate: true,
			statement: { type: 'create_schema', name: schema },
		},
		drop_schema: {
			family: 'schema',
			needs: ['schema'],
			statement: { type: 'drop_schema', name: schema },
		},
		rename_schema: {
			family: 'schema',
			needs: ['schema'],
			statement: { type: 'rename_schema', from: { name: schema }, to: { name: targetSchema } } as any,
		},

		create_sequence: {
			family: 'sequence',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_sequence', sequence: { schema, name: sequence } } as any,
		},
		drop_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence'],
			statement: { type: 'drop_sequence', sequence: { schema, name: sequence } } as any,
		},
		rename_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence'],
			statement: {
				type: 'rename_sequence',
				from: { schema, name: sequence },
				to: { schema, name: named('sq_new') },
			} as any,
		},
		alter_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence'],
			statement: { type: 'alter_sequence', sequence: { schema, name: sequence, incrementBy: '2' } } as any,
		},
		move_sequence: {
			family: 'sequence',
			needs: ['schema', 'targetSchema', 'sequence'],
			statement: {
				type: 'move_sequence',
				from: { schema, name: sequence },
				to: { schema: targetSchema, name: sequence },
			},
		},

		create_view: {
			family: 'view',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_view', view: { schema, name: view, definition: 'SELECT 1 AS "x"' } } as any,
		},
		drop_view: {
			family: 'view',
			needs: ['schema', 'view'],
			statement: { type: 'drop_view', view: { schema, name: view } } as any,
		},
		rename_view: {
			family: 'view',
			needs: ['schema', 'view'],
			statement: {
				type: 'rename_view',
				from: { schema, name: view },
				to: { schema, name: named('vw_new') },
			} as any,
		},
		alter_view: {
			family: 'view',
			needs: ['schema', 'view'],
			statement: {
				type: 'alter_view',
				view: { schema, name: view },
				diff: { with: { from: {}, to: { securityBarrier: true } } },
			} as any,
		},
		move_view: {
			family: 'view',
			needs: ['schema', 'targetSchema', 'view'],
			statement: {
				type: 'move_view',
				fromSchema: schema,
				toSchema: targetSchema,
				view: { schema: targetSchema, name: view },
			} as any,
		},

		create_policy: {
			family: 'policy',
			needs: onTable,
			isCreate: true,
			statement: { type: 'create_policy', policy: tablePolicy },
		},
		// A policy for the role `r`.
		'create_policy:role': {
			family: 'policy',
			needs: [...onTable, 'role'],
			isCreate: true,
			statement: { type: 'create_policy', policy: { ...tablePolicy, roles: [role] } },
		},
		drop_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: { type: 'drop_policy', policy: tablePolicy },
		},
		rename_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: {
				type: 'rename_policy',
				from: { schema, table, name: tablePolicy.name },
				to: { schema, table, name: named('pol_new') },
			} as any,
		},
		alter_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: { type: 'alter_policy', policy: { ...tablePolicy, using: 'true' }, diff: {} } as any,
		},
		recreate_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: { type: 'recreate_policy', policy: { ...tablePolicy, as: 'RESTRICTIVE' }, diff: {} } as any,
		},

		alter_rls: {
			family: 'rls',
			needs: onTable,
			statement: { type: 'alter_rls', schema, name: table, isRlsEnabled: true },
		},
		'alter_rls:disable': {
			family: 'rls',
			needs: [...onTable, 'rls'],
			statement: { type: 'alter_rls', schema, name: table, isRlsEnabled: false },
		},

		create_role: {
			family: 'role',
			needs: [],
			isCreate: true,
			statement: { type: 'create_role', role: { name: role, inherit: true } } as any,
		},
		drop_role: {
			family: 'role',
			needs: ['role'],
			statement: { type: 'drop_role', role: { name: role, inherit: true } } as any,
		},
		rename_role: {
			family: 'role',
			needs: ['role'],
			statement: { type: 'rename_role', from: { name: role }, to: { name: named('r_new') } } as any,
		},
		alter_role: {
			family: 'role',
			needs: ['role'],
			statement: {
				type: 'alter_role',
				role: { name: role, inherit: true },
				diff: { createDb: { from: false, to: true } },
			} as any,
		},

		grant_privilege: {
			family: 'privilege',
			needs: [...onTable, 'role'],
			isCreate: true,
			statement: { type: 'grant_privilege', privilege: select },
		},
		'grant_privilege:insert': {
			family: 'privilege',
			needs: [...onTable, 'role'],
			isCreate: true,
			statement: { type: 'grant_privilege', privilege: privilege(schema, table, role, 'INSERT') },
		},
		revoke_privilege: {
			family: 'privilege',
			needs: [...onTable, 'role', 'privilege'],
			statement: { type: 'revoke_privilege', privilege: select },
		},
		regrant_privilege: {
			family: 'privilege',
			needs: [...onTable, 'role', 'privilege'],
			statement: { type: 'regrant_privilege', privilege: select } as any,
		},
	};
};

export function build(type: string, prefix = ''): JsonStatement {
	const row = rows(prefix)[type];
	if (!row) throw new Error(`no builder for ${type}`);
	return row.statement;
}
