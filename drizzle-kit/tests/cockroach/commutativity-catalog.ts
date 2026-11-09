import { cockroachCommutativity } from 'src/dialects/cockroach/commutativity';
import { fromJson } from 'src/dialects/cockroach/convertor';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	Table,
	View,
} from 'src/dialects/cockroach/ddl';
import type { JsonRenameConstraint, JsonStatement } from 'src/dialects/cockroach/statements';

// The statement catalog of the cockroach commutativity tests. One row holds one representative statement for
// each statement type, and one more for each variant that has another footprint. The rows build their entities
// from the cockroach DDL rows, so the fields match what the drizzle schema builders write.

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

export const idx = (schema: string, table: string, name: string, columns: string[], extra: Partial<Index> = {}) =>
	({
		schema,
		table,
		name,
		nameExplicit: true,
		columns: columns.map((value) => ({ value, isExpression: false, asc: true })),
		isUnique: false,
		where: null,
		method: 'btree',
		...extra,
	}) as Index;

export const pk = (schema: string, table: string, columns: string[], name = `${table}_pkey`) =>
	({ schema, table, name, columns, nameExplicit: true }) as PrimaryKey;

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

export const check = (schema: string, table: string, name: string, value: string) =>
	({ schema, table, name, value }) as CheckConstraint;

export const policy = (schema: string, table: string, name: string, roles = ['public']) =>
	({ schema, table, name, as: 'PERMISSIVE', for: 'ALL', roles, using: null, withCheck: null }) as Policy;

export const sequence = (schema: string, name: string) =>
	({
		schema,
		name,
		incrementBy: null,
		minValue: null,
		maxValue: null,
		startWith: null,
		cacheSize: null,
	}) as Sequence;

export const role = (name: string) => ({ name, createDb: null, createRole: null }) as Role;

export const view = (schema: string, name: string) =>
	({
		schema,
		name,
		definition: 'select 1 as id',
		withNoData: null,
		materialized: false,
	}) as View;

export const enumType = (schema: string, name: string): Enum => ({
	schema,
	name,
	values: ['a', 'b'],
	entityType: 'enums',
});

export const schemaRow = (name: string) => ({ name }) as Schema;

export const table = (
	schema: string,
	name: string,
	columns: Column[],
	extra: Partial<Table> = {},
): Table => ({
	schema,
	name,
	columns,
	indexes: [],
	pk: null,
	fks: [],
	checks: [],
	policies: [],
	isRlsEnabled: false,
	...extra,
});

// Builds the `alter_column` statement for a column, with each changed property in the form that the diff
// reports.
const alterColumn = (
	from: Column,
	change: Record<string, { from: unknown; to: unknown }>,
	flags: { wasEnum?: boolean; isEnum?: boolean } = {},
) => {
	const to = { ...from, ...Object.fromEntries(Object.entries(change).map(([key, value]) => [key, value.to])) };
	return {
		type: 'alter_column',
		to,
		diff: { schema: from.schema, table: from.table, name: from.name, ...change, $left: from, $right: to },
		wasEnum: flags.wasEnum ?? false,
		isEnum: flags.isEnum ?? false,
	} as JsonStatement;
};

// An object that the SQL of a row needs in the database.
export type NeededObject =
	| 'schema'
	| 'targetSchema'
	| 'table'
	| 'column'
	| 'notNullColumn'
	| 'referencedTable'
	| 'index'
	| 'pk'
	| 'fk'
	| 'check'
	| 'enum'
	| 'enumColumn'
	| 'sequence'
	| 'view'
	| 'policy'
	| 'role';

const onTable = ['schema', 'table'] as const;
const onColumn = [...onTable, 'column'] as const;

export type Row = {
	statement: JsonStatement;
	// Groups the rows on the visualizer page, which gives each family one color and one band.
	family: string;
	needs: readonly NeededObject[];
	// The statement creates the object that it names.
	isCreate?: boolean;
};

// Statement types that the convertor cannot turn into SQL, because the diff never writes them. Their footprints
// still matter to `check`, so they stay in the catalog with no SQL: none of them is idempotent, so no hash
// depends on the SQL.
const withoutConvertor = new Set(['remove_from_schema', 'set_new_schema', 'alter_type_drop_value', 'alter_view']);

// The statements of the commutativity matrix: one row for each statement type of the cockroach union, plus the
// rows for a second variant. All rows target table s.t and column c1, so that the matrix shows the most overlap.
export const rows = (prefix = ''): Record<string, Row> => {
	const named = (name: string) => prefix + name;
	const schema = named('s');
	const targetSchema = named('s_new');
	const tableName = named('t');
	const column = named('c1');
	const referencedTable = named('t2');
	const referencedColumn = named('c2');
	const index = named('ix');
	const enumName = named('e');
	const enumColumn = col(schema, tableName, named('ce'), { type: enumName, typeSchema: schema });
	const sequenceName = named('sq');
	const viewName = named('vw');
	const roleName = named('r');
	const policyName = named('pol');
	const checkName = named('ck');
	const pkName = named('pk');
	const fkName = named('fk');

	const anyTable = table(schema, tableName, [col(schema, tableName, 'id')]);
	const renameConstraint = (
		entityType: JsonRenameConstraint['entityType'],
		columns: string[],
		needs: readonly NeededObject[],
		from: string,
	): Row => ({
		family: 'constraint',
		needs: [...onColumn, ...needs],
		statement: {
			type: 'rename_constraint',
			entityType,
			schema,
			table: tableName,
			from,
			to: named('to'),
			columns,
		},
	});

	return {
		create_table: {
			family: 'table',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_table', table: anyTable },
		},
		drop_table: {
			family: 'table',
			needs: onTable,
			statement: { type: 'drop_table', table: anyTable, key: `${schema}.${tableName}` },
		},
		rename_table: {
			family: 'table',
			needs: onTable,
			statement: { type: 'rename_table', schema, from: tableName, to: named('t_new') },
		},
		move_table: {
			family: 'table',
			needs: [...onTable, 'targetSchema'],
			statement: { type: 'move_table', name: tableName, from: schema, to: targetSchema },
		},
		remove_from_schema: {
			family: 'table',
			needs: onTable,
			statement: { type: 'remove_from_schema', table: tableName, schema },
		},
		set_new_schema: {
			family: 'table',
			needs: [...onTable, 'targetSchema'],
			statement: { type: 'set_new_schema', table: tableName, from: schema, to: targetSchema },
		},

		add_column: {
			family: 'column',
			needs: onTable,
			isCreate: true,
			statement: { type: 'add_column', column: col(schema, tableName, column) },
		},
		drop_column: {
			family: 'column',
			needs: onColumn,
			statement: { type: 'drop_column', column: col(schema, tableName, column) },
		},
		// A NOT NULL change is not an `alter_column` in cockroach: the diff writes `alter_add_column_not_null` or
		// `alter_drop_column_not_null` for it, and the `alter_column` convertor emits no SQL for one.
		alter_column: {
			family: 'column',
			needs: onColumn,
			statement: alterColumn(col(schema, tableName, column), { default: { from: null, to: "'x'" } }),
		},
		'alter_column:type': {
			family: 'column',
			needs: onColumn,
			statement: alterColumn(col(schema, tableName, column), { type: { from: 'varchar', to: 'text' } }),
		},
		alter_add_column_not_null: {
			family: 'column',
			needs: onColumn,
			statement: { type: 'alter_add_column_not_null', schema, table: tableName, column },
		},
		alter_drop_column_not_null: {
			family: 'column',
			needs: onColumn,
			statement: { type: 'alter_drop_column_not_null', schema, table: tableName, column },
		},
		recreate_column: {
			family: 'column',
			needs: onColumn,
			statement: {
				type: 'recreate_column',
				diff: { schema, table: tableName, name: column, $right: col(schema, tableName, column) },
			} as JsonStatement,
		},
		rename_column: {
			family: 'column',
			needs: onColumn,
			statement: {
				type: 'rename_column',
				from: col(schema, tableName, column),
				to: col(schema, tableName, named('c1_new')),
			},
		},

		create_index: {
			family: 'index',
			needs: [...onTable, 'column'],
			isCreate: true,
			statement: { type: 'create_index', index: idx(schema, tableName, index, [column]), newTable: false },
		},
		drop_index: {
			family: 'index',
			needs: [...onTable, 'column', 'index'],
			statement: { type: 'drop_index', index: idx(schema, tableName, index, [column]) },
		},
		recreate_index: {
			family: 'index',
			needs: [...onTable, 'column', 'index'],
			statement: {
				type: 'recreate_index',
				diff: { $left: idx(schema, tableName, index, [column]), $right: idx(schema, tableName, index, [named('c1')]) },
			} as JsonStatement,
		},
		rename_index: {
			family: 'index',
			needs: [...onTable, 'column', 'index'],
			statement: {
				type: 'rename_index',
				schema,
				table: tableName,
				from: index,
				to: named('ix_new'),
				columns: [column],
			},
		},

		add_pk: {
			family: 'pk',
			needs: [...onTable, 'notNullColumn'],
			isCreate: true,
			statement: { type: 'add_pk', pk: pk(schema, tableName, [column], pkName) },
		},
		drop_pk: {
			family: 'pk',
			needs: [...onTable, 'column', 'pk'],
			statement: { type: 'drop_pk', pk: pk(schema, tableName, [column], pkName) },
		},
		alter_pk: {
			family: 'pk',
			needs: [...onTable, 'column', 'pk'],
			statement: {
				type: 'alter_pk',
				pk: pk(schema, tableName, [column], pkName),
				diff: { columns: { from: [column], to: [named('c1')] } },
			} as JsonStatement,
		},
		recreate_pk: {
			family: 'pk',
			needs: [...onTable, 'column', 'pk'],
			statement: {
				type: 'recreate_pk',
				left: pk(schema, tableName, [column], pkName),
				right: pk(schema, tableName, [named('c1')], named('pk_new')),
			},
		},
		'rename_constraint:pk': renameConstraint('pks', [column], ['pk'], named('pk')),

		create_fk: {
			family: 'fk',
			needs: [...onTable, 'column', 'referencedTable'],
			isCreate: true,
			statement: {
				type: 'create_fk',
				fk: fk(schema, tableName, fkName, [column], schema, referencedTable, [referencedColumn]),
			},
		},
		drop_fk: {
			family: 'fk',
			needs: [...onTable, 'column', 'fk', 'referencedTable'],
			statement: {
				type: 'drop_fk',
				fk: fk(schema, tableName, fkName, [column], schema, referencedTable, [referencedColumn]),
			},
		},
		recreate_fk: {
			family: 'fk',
			needs: [...onTable, 'column', 'fk', 'referencedTable'],
			statement: {
				type: 'recreate_fk',
				fk: fk(schema, tableName, fkName, [column], schema, referencedTable, [referencedColumn]),
				diff: {} as never,
			},
		},
		'rename_constraint:fk': renameConstraint('fks', [column], ['referencedTable', 'fk'], named('fk')),

		add_check: {
			family: 'check',
			needs: [...onTable, 'column'],
			isCreate: true,
			statement: {
				type: 'add_check',
				check: check(schema, tableName, checkName, `"${column}" <> ''`),
				columns: [column],
			},
		},
		drop_check: {
			family: 'check',
			needs: [...onTable, 'column', 'check'],
			statement: {
				type: 'drop_check',
				check: check(schema, tableName, checkName, `"${column}" <> ''`),
				columns: [column],
			},
		},
		alter_check: {
			family: 'check',
			needs: [...onTable, 'column', 'check'],
			statement: {
				type: 'alter_check',
				check: check(schema, tableName, checkName, `"${column}" <> 'x'`),
				diff: {
					$left: check(schema, tableName, checkName, `"${column}" <> ''`),
					$right: check(schema, tableName, checkName, `"${column}" <> 'x'`),
				} as never,
				newColumns: [column],
				oldColumns: [column],
			},
		},
		'rename_constraint:check': renameConstraint('checks', [column], ['check'], named('ck')),

		create_enum: {
			family: 'enum',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_enum', enum: enumType(schema, enumName) },
		},
		drop_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: { type: 'drop_enum', enum: enumType(schema, enumName) },
		},
		rename_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: { type: 'rename_enum', schema, from: enumName, to: named('e_new') },
		},
		move_enum: {
			family: 'enum',
			needs: ['schema', 'enum', 'targetSchema'],
			statement: {
				type: 'move_enum',
				from: { name: enumName, schema },
				to: { name: enumName, schema: targetSchema },
			},
		},
		alter_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: {
				type: 'alter_enum',
				to: enumType(schema, enumName),
				from: enumType(schema, enumName),
				diff: [{ type: 'added', value: 'c' }],
			},
		},
		recreate_enum: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: {
				type: 'recreate_enum',
				to: enumType(schema, enumName),
				from: enumType(schema, enumName),
				columns: [],
			},
		},
		alter_type_drop_value: {
			family: 'enum',
			needs: ['schema', 'enum'],
			statement: {
				type: 'alter_type_drop_value',
				deletedValues: ['b'],
				enum: enumType(schema, enumName),
				columns: [],
			},
		},

		create_sequence: {
			family: 'sequence',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_sequence', sequence: sequence(schema, sequenceName) },
		},
		drop_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence'],
			statement: { type: 'drop_sequence', sequence: sequence(schema, sequenceName) },
		},
		rename_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence'],
			statement: {
				type: 'rename_sequence',
				from: sequence(schema, sequenceName),
				to: sequence(schema, named('sq_new')),
			},
		},
		move_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence', 'targetSchema'],
			statement: {
				type: 'move_sequence',
				from: { name: sequenceName, schema },
				to: { name: sequenceName, schema: targetSchema },
			},
		},
		alter_sequence: {
			family: 'sequence',
			needs: ['schema', 'sequence'],
			statement: {
				type: 'alter_sequence',
				sequence: sequence(schema, sequenceName),
				diff: { incrementBy: { from: null, to: '2' } },
			} as JsonStatement,
		},

		create_view: {
			family: 'view',
			needs: ['schema'],
			isCreate: true,
			statement: { type: 'create_view', view: view(schema, viewName) },
		},
		drop_view: {
			family: 'view',
			needs: ['schema', 'view'],
			statement: { type: 'drop_view', view: view(schema, viewName), cause: null },
		},
		rename_view: {
			family: 'view',
			needs: ['schema', 'view'],
			statement: { type: 'rename_view', from: view(schema, viewName), to: view(schema, named('vw_new')) },
		},
		move_view: {
			family: 'view',
			needs: ['schema', 'view', 'targetSchema'],
			statement: { type: 'move_view', fromSchema: schema, toSchema: targetSchema, view: view(schema, viewName) },
		},
		alter_view: {
			family: 'view',
			needs: ['schema', 'view'],
			statement: {
				type: 'alter_view',
				view: view(schema, viewName),
				diff: { definition: { from: 'select 1', to: 'select 2' } },
			} as JsonStatement,
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
			statement: { type: 'rename_schema', from: schemaRow(schema), to: schemaRow(targetSchema) },
		},

		create_policy: {
			family: 'policy',
			needs: onTable,
			isCreate: true,
			statement: { type: 'create_policy', policy: policy(schema, tableName, policyName) },
		},
		drop_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: { type: 'drop_policy', policy: policy(schema, tableName, policyName) },
		},
		rename_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: {
				type: 'rename_policy',
				from: policy(schema, tableName, policyName),
				to: policy(schema, tableName, named('pol_new')),
			},
		},
		alter_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: {
				type: 'alter_policy',
				policy: policy(schema, tableName, policyName),
				diff: {} as never,
			},
		},
		recreate_policy: {
			family: 'policy',
			needs: [...onTable, 'policy'],
			statement: {
				type: 'recreate_policy',
				policy: policy(schema, tableName, policyName),
				diff: {} as never,
			},
		},
		alter_rls: {
			family: 'policy',
			needs: onTable,
			statement: { type: 'alter_rls', schema, name: tableName, isRlsEnabled: false },
		},

		create_role: {
			family: 'role',
			needs: [],
			isCreate: true,
			statement: { type: 'create_role', role: role(roleName) },
		},
		drop_role: {
			family: 'role',
			needs: ['role'],
			statement: { type: 'drop_role', role: role(roleName) },
		},
		alter_role: {
			family: 'role',
			needs: ['role'],
			statement: {
				type: 'alter_role',
				role: role(roleName),
				diff: { createDb: { from: null, to: true } },
			} as JsonStatement,
		},
	};
};

export const build = (type: string, prefix = ''): JsonStatement => {
	const row = rows(prefix)[type];
	if (!row) throw new Error(`no builder for ${type}`);
	return row.statement;
};

// Builds the footprint of each statement from the SQL that the convertor writes for it.
export const footprintsOfStatements = (statements: JsonStatement[]) =>
	statements.map((statement) => {
		const sql = withoutConvertor.has(statement.type) ? [] : fromJson([statement]).sqlStatements;
		return cockroachCommutativity.buildFootprint(statement, sql);
	});
