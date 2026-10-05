import {
	type CommutativityStatementDefinitions,
	type CommutativityStatementInfo,
	FacetCommutativity,
	type FacetPaths,
	type ParsedSnapshotInput,
} from '../../commutativity/engine';
import type { ConflictTarget } from '../../commutativity/types';
import { copyDDL } from '../dialect';
import { type Column, fromEntities, type IndexColumn, type Privilege } from './ddl';
import { ddlDiff } from './diff';
import { renameResolvers } from './renames';
import { drySnapshot, type PostgresSnapshot, startingState } from './snapshot';
import type { JsonStatement } from './statements';

type FootprintTarget = {
	schema: string;
	objectName: string;
	columnName: string;
};

type StatementInfo = CommutativityStatementInfo<JsonStatement, FootprintTarget>;

type StatementDefinitions = CommutativityStatementDefinitions<
	JsonStatement,
	FootprintTarget
>;

const privilegeTypes: Privilege['type'][] = [
	'ALL',
	'SELECT',
	'INSERT',
	'UPDATE',
	'DELETE',
	'TRUNCATE',
	'REFERENCES',
	'TRIGGER',
];

function makeTarget(
	schema: string,
	objectName: string,
	columnName = '',
): FootprintTarget {
	return { schema, objectName, columnName };
}

function makeTableTarget(schema: string, tableName: string): FootprintTarget {
	return makeTarget(schema, tableName);
}

function makeSchemaTarget(schemaName: string): FootprintTarget {
	return makeTarget(schemaName, '');
}

// The snapshot's rename deltas are the rename decisions. Generated names are not kept, so a drop and a create
// of a constraint in the deltas stay a drop and a create statement, as in the SQL of the migration.
export const snapshotStatements = async (
	snapshots: Map<string, PostgresSnapshot>,
	snapshot: PostgresSnapshot,
): Promise<JsonStatement[]> => {
	// ddlDiff changes both states that it gets, so each one is a separate copy.
	const from = startingState(snapshots, snapshot.prevIds);
	const to = snapshot.type === 'diff' ? copyDDL(from) : fromEntities(snapshot.ddl);
	const resolver = renameResolvers(to, snapshot.type === 'diff' ? snapshot.deltas : []);
	const { statements } = await ddlDiff(
		from,
		to,
		resolver('schemas'),
		resolver('enums'),
		resolver('sequences'),
		resolver('policies'),
		resolver('roles'),
		resolver('tables'),
		resolver('columns'),
		resolver('views'),
		resolver('uniques'),
		resolver('indexes'),
		resolver('checks'),
		resolver('pks'),
		resolver('fks'),
		'default',
		false,
	);
	return statements;
};

/**
 * Postgres-specific commutativity rules.
 *
 * `buildFacetPaths` decides which statements conflict. `getStatementDefinitions()` feeds only the report:
 * `buildInfo` gives the target that `describeStatement` and `describeStatementTarget` print. Postgres does
 * not read the `conflicts` arrays of the definitions.
 */
class PostgresCommutativity extends FacetCommutativity<
	JsonStatement,
	PostgresSnapshot,
	FootprintTarget
> {
	private schemaLevelActions = new Set([
		'create_table',
		'drop_table',
		'rename_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
		'create_view',
		'drop_view',
		'alter_view',
		'rename_view',
		'move_view',
		'create_enum',
		'drop_enum',
		'alter_enum',
		'recreate_enum',
		'rename_enum',
		'move_enum',
		'create_sequence',
		'drop_sequence',
		'alter_sequence',
		'rename_sequence',
		'move_sequence',
		'create_schema',
		'drop_schema',
		'rename_schema',
		'create_role',
		'drop_role',
		'alter_role',
		'rename_role',
	]);
	private schemaConflictTypes: JsonStatement['type'][] = [
		'create_schema',
		'drop_schema',
		'rename_schema',
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
		'grant_privilege',
		'revoke_privilege',
		'regrant_privilege',
	];

	protected override getStatementDefinitions(): StatementDefinitions {
		return {
			// Table operations
			create_table: {
				conflicts: ['create_table', 'drop_table', 'rename_table', 'move_table'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.table.schema, statement.table.name),
					ancestors: [],
				}),
			},
			drop_table: {
				conflicts: [
					'create_table',
					'drop_table',
					'rename_table',
					'move_table',
					'add_column',
					'drop_column',
					'alter_column',
					'recreate_column',
					'rename_column',
					'alter_rls',
					'create_index',
					'recreate_index',
				],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.table.schema, statement.table.name),
					ancestors: [],
				}),
			},
			rename_table: {
				conflicts: ['create_table', 'drop_table', 'rename_table', 'move_table', 'create_index'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.schema, statement.from),
					ancestors: [],
				}),
			},
			move_table: {
				conflicts: ['create_table', 'drop_table', 'rename_table', 'move_table'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.from, statement.name),
					ancestors: [],
				}),
			},

			// Column operations
			add_column: {
				conflicts: ['add_column', 'alter_column', 'drop_column', 'rename_column', 'recreate_column'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.column.schema, statement.column.table, statement.column.name),
					ancestors: [makeTableTarget(statement.column.schema, statement.column.table)],
				}),
			},
			drop_column: {
				conflicts: ['add_column', 'drop_column', 'alter_column', 'rename_column', 'recreate_column'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.column.schema, statement.column.table, statement.column.name),
					ancestors: [makeTableTarget(statement.column.schema, statement.column.table)],
				}),
			},
			alter_column: {
				conflicts: ['add_column', 'drop_column', 'alter_column', 'rename_column', 'recreate_column'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.to.schema, statement.to.table, statement.to.name),
					ancestors: [makeTableTarget(statement.to.schema, statement.to.table)],
				}),
			},
			recreate_column: {
				conflicts: ['add_column', 'drop_column', 'alter_column', 'recreate_column', 'rename_column'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.diff.schema, statement.diff.table, statement.diff.name),
					ancestors: [makeTableTarget(statement.diff.schema, statement.diff.table)],
				}),
			},
			rename_column: {
				conflicts: ['add_column', 'drop_column', 'alter_column', 'recreate_column', 'rename_column'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from.schema, statement.from.table, statement.from.name),
					ancestors: [makeTableTarget(statement.from.schema, statement.from.table)],
				}),
			},

			// Index operations
			create_index: {
				conflicts: ['create_index', 'drop_index', 'rename_index'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.index.schema, statement.index.name),
					ancestors: [makeTableTarget(statement.index.schema, statement.index.table)],
				}),
			},
			drop_index: {
				conflicts: ['create_index', 'drop_index', 'rename_index'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.index.schema, statement.index.name),
					ancestors: [makeTableTarget(statement.index.schema, statement.index.table)],
				}),
			},
			rename_index: {
				conflicts: ['create_index', 'drop_index', 'rename_index'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.schema, statement.from),
					ancestors: [],
				}),
			},
			recreate_index: {
				conflicts: ['create_index', 'drop_index', 'rename_index'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.diff.schema, statement.diff.name),
					ancestors: [makeTableTarget(statement.index.schema, statement.index.table)],
				}),
			},

			// Primary key operations
			add_pk: {
				conflicts: ['add_pk', 'drop_pk', 'alter_pk'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.pk.schema, statement.pk.table),
					ancestors: [],
				}),
			},
			drop_pk: {
				conflicts: ['add_pk', 'drop_pk', 'alter_pk'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.pk.schema, statement.pk.table),
					ancestors: [],
				}),
			},
			alter_pk: {
				conflicts: ['add_pk', 'drop_pk', 'alter_pk'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.pk.schema, statement.pk.table),
					ancestors: [],
				}),
			},

			// Foreign key operations
			create_fk: {
				conflicts: ['create_fk', 'drop_fk', 'recreate_fk'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.fk.schema, statement.fk.table),
					ancestors: [],
				}),
			},
			drop_fk: {
				conflicts: ['create_fk', 'drop_fk', 'recreate_fk'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.fk.schema, statement.fk.table),
					ancestors: [],
				}),
			},
			recreate_fk: {
				conflicts: ['create_fk', 'drop_fk', 'recreate_fk'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.fk.schema, statement.fk.table),
					ancestors: [],
				}),
			},

			// Unique constraint operations
			add_unique: {
				conflicts: ['add_unique', 'drop_unique', 'alter_unique'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.unique.schema, statement.unique.table),
					ancestors: [],
				}),
			},
			drop_unique: {
				conflicts: ['add_unique', 'drop_unique', 'alter_unique'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.unique.schema, statement.unique.table),
					ancestors: [],
				}),
			},
			alter_unique: {
				conflicts: ['add_unique', 'drop_unique', 'alter_unique'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.diff.schema, statement.diff.table),
					ancestors: [],
				}),
			},

			// Check constraint operations
			add_check: {
				conflicts: ['add_check', 'drop_check', 'alter_check'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.check.schema, statement.check.table),
					ancestors: [],
				}),
			},
			drop_check: {
				conflicts: ['add_check', 'drop_check', 'alter_check'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.check.schema, statement.check.table),
					ancestors: [],
				}),
			},
			alter_check: {
				conflicts: ['add_check', 'drop_check', 'alter_check'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.diff.schema, statement.diff.table),
					ancestors: [],
				}),
			},

			// Constraint operations
			rename_constraint: {
				conflicts: [
					'rename_constraint',
					'add_pk',
					'drop_pk',
					'alter_pk',
					'add_unique',
					'drop_unique',
					'alter_unique',
					'add_check',
					'drop_check',
					'alter_check',
					'create_fk',
					'drop_fk',
					'recreate_fk',
				],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.schema, statement.table),
					ancestors: [],
				}),
			},

			// Enum operations
			create_enum: {
				conflicts: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.enum.schema, statement.enum.name),
					ancestors: [],
				}),
			},
			drop_enum: {
				conflicts: [
					'create_enum',
					'drop_enum',
					'rename_enum',
					'alter_enum',
					'recreate_enum',
					'move_enum',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.enum.schema, statement.enum.name),
					ancestors: [],
				}),
			},
			rename_enum: {
				conflicts: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.schema, statement.from),
					ancestors: [],
				}),
			},
			alter_enum: {
				conflicts: [
					'create_enum',
					'drop_enum',
					'rename_enum',
					'alter_enum',
					'recreate_enum',
					'move_enum',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.to.schema, statement.to.name),
					ancestors: [],
				}),
			},
			recreate_enum: {
				conflicts: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.to.schema, statement.to.name),
					ancestors: [],
				}),
			},
			move_enum: {
				conflicts: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from.schema || 'public', statement.from.name),
					ancestors: [],
				}),
			},

			// Sequence operations
			create_sequence: {
				conflicts: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.sequence.schema, statement.sequence.name),
					ancestors: [],
				}),
			},
			drop_sequence: {
				conflicts: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.sequence.schema, statement.sequence.name),
					ancestors: [],
				}),
			},
			rename_sequence: {
				conflicts: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from.schema, statement.from.name),
					ancestors: [],
				}),
			},
			alter_sequence: {
				conflicts: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.sequence.schema, statement.sequence.name),
					ancestors: [],
				}),
			},
			move_sequence: {
				conflicts: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from.schema || 'public', statement.from.name),
					ancestors: [],
				}),
			},

			// View operations
			create_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'move_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.schema, statement.view.name),
					ancestors: [],
				}),
			},
			drop_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'move_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.schema, statement.view.name),
					ancestors: [],
				}),
			},
			rename_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'move_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from.schema, statement.from.name),
					ancestors: [],
				}),
			},
			alter_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'move_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.schema, statement.view.name),
					ancestors: [],
				}),
			},
			move_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'move_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.fromSchema, statement.view.name),
					ancestors: [],
				}),
			},

			// Schema operations
			create_schema: {
				conflicts: this.schemaConflictTypes,
				buildInfo: (statement) => ({
					primary: makeSchemaTarget(statement.name),
					ancestors: [],
				}),
			},
			drop_schema: {
				conflicts: this.schemaConflictTypes,
				buildInfo: (statement) => ({
					primary: makeSchemaTarget(statement.name),
					ancestors: [],
				}),
			},
			rename_schema: {
				conflicts: this.schemaConflictTypes,
				buildInfo: (statement) => ({
					primary: makeSchemaTarget(statement.from.name),
					ancestors: [],
				}),
			},

			// Policy operations
			create_policy: {
				conflicts: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.policy.schema, statement.policy.table),
					ancestors: [],
				}),
			},
			drop_policy: {
				conflicts: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.policy.schema, statement.policy.table),
					ancestors: [],
				}),
			},
			rename_policy: {
				conflicts: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.from.schema, statement.from.table),
					ancestors: [],
				}),
			},
			alter_policy: {
				conflicts: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.policy.schema, statement.policy.table),
					ancestors: [],
				}),
			},
			recreate_policy: {
				conflicts: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.policy.schema, statement.policy.table),
					ancestors: [],
				}),
			},

			// RLS operations
			alter_rls: {
				conflicts: ['alter_rls', 'create_policy', 'drop_policy', 'alter_policy', 'recreate_policy'],
				buildInfo: (statement) => ({
					primary: makeTableTarget(statement.schema, statement.name),
					ancestors: [],
				}),
			},

			// Role operations
			create_role: {
				conflicts: ['create_role', 'drop_role', 'rename_role', 'alter_role'],
				buildInfo: (statement) => ({
					primary: makeTarget('', statement.role.name),
					ancestors: [],
				}),
			},
			drop_role: {
				conflicts: [
					'create_role',
					'drop_role',
					'rename_role',
					'alter_role',
					'grant_privilege',
					'revoke_privilege',
					'regrant_privilege',
				],
				buildInfo: (statement) => ({
					primary: makeTarget('', statement.role.name),
					ancestors: [],
				}),
			},
			rename_role: {
				conflicts: ['create_role', 'drop_role', 'rename_role', 'alter_role'],
				buildInfo: (statement) => ({
					primary: makeTarget('', statement.from.name),
					ancestors: [],
				}),
			},
			alter_role: {
				conflicts: ['create_role', 'drop_role', 'rename_role', 'alter_role'],
				buildInfo: (statement) => ({
					primary: makeTarget('', statement.role.name),
					ancestors: [],
				}),
			},

			// Privilege operations
			grant_privilege: {
				conflicts: ['grant_privilege', 'revoke_privilege', 'regrant_privilege'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.privilege.schema || '', statement.privilege.table || ''),
					ancestors: [],
				}),
			},
			revoke_privilege: {
				conflicts: ['grant_privilege', 'revoke_privilege', 'regrant_privilege'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.privilege.schema || '', statement.privilege.table || ''),
					ancestors: [],
				}),
			},
			regrant_privilege: {
				conflicts: ['grant_privilege', 'revoke_privilege', 'regrant_privilege'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.privilege.schema || '', statement.privilege.table || ''),
					ancestors: [],
				}),
			},
		};
	}

	protected override describeStatement(
		statement: JsonStatement,
		info: StatementInfo,
	): string {
		if (statement.type === 'create_index' || statement.type === 'drop_index') {
			return `${statement.type}: ${statement.index.name} on ${statement.index.table} table`;
		}

		if (statement.type === 'recreate_index') {
			return `${statement.type}: ${statement.index.name} on ${statement.index.table} table`;
		}

		if (
			info.action === 'create_schema'
			|| info.action === 'drop_schema'
			|| info.action === 'rename_schema'
		) {
			return `${info.action}: ${info.primary.schema} schema`;
		}

		if (this.schemaLevelActions.has(info.action)) {
			const container = info.primary.schema || 'schema';
			return `${info.action}: ${info.primary.objectName} in ${container} schema`;
		}

		if (info.primary.columnName) {
			return `${info.action}: ${info.primary.columnName} on ${info.primary.objectName} table`;
		}

		return `${info.action} on ${info.primary.objectName} table`;
	}

	private enumLevelActions = new Set([
		'create_enum',
		'drop_enum',
		'alter_enum',
		'recreate_enum',
		'rename_enum',
		'move_enum',
	]);

	private viewLevelActions = new Set([
		'create_view',
		'drop_view',
		'alter_view',
		'rename_view',
		'move_view',
	]);

	private sequenceLevelActions = new Set([
		'create_sequence',
		'drop_sequence',
		'alter_sequence',
		'rename_sequence',
		'move_sequence',
	]);

	protected override describeStatementTarget(
		statement: JsonStatement,
		info: StatementInfo,
	): ConflictTarget {
		if (
			statement.type === 'create_index'
			|| statement.type === 'drop_index'
			|| statement.type === 'recreate_index'
		) {
			return { kind: 'index', name: statement.index.name, table: statement.index.table };
		}

		if (
			info.action === 'create_schema'
			|| info.action === 'drop_schema'
			|| info.action === 'rename_schema'
		) {
			return { kind: 'schema', name: info.primary.schema };
		}

		if (this.enumLevelActions.has(info.action)) {
			return { kind: 'enum', name: info.primary.objectName, schema: info.primary.schema };
		}

		if (this.viewLevelActions.has(info.action)) {
			return { kind: 'view', name: info.primary.objectName, schema: info.primary.schema };
		}

		if (this.sequenceLevelActions.has(info.action)) {
			return { kind: 'sequence', name: info.primary.objectName, schema: info.primary.schema };
		}

		if (info.primary.columnName) {
			return {
				kind: 'column',
				name: info.primary.columnName,
				table: info.primary.objectName,
				schema: info.primary.schema,
			};
		}

		return { kind: 'table', name: info.primary.objectName, schema: info.primary.schema };
	}

	// ----------------------------------------------------------------------
	// Each statement declares the nodes it structurally owns, the existence it
	// destroys (drops), and the existence it needs (ancestors + cross-refs).
	// Node identity here mirrors the DDL's own `schema:table:name:entityType`
	// key, so children/cross-refs line up with the nodes drops remove.
	// ----------------------------------------------------------------------

	protected override buildFacetPaths(statement: JsonStatement): FacetPaths {
		// EXACT (strict) COMMUTATIVITY via three facets per node:
		//   s|N  self       — written by EVERY structural op on N. Two ops on the same
		//                     node collide here (add+drop, two alters, …).
		//   n|N  name       — written by create/drop/rename/move (anything that changes
		//                     N's NAME). Read by statements whose SQL hardcodes N's name,
		//                     so a rename of N breaks them (e.g. `CREATE INDEX … ON (c)`).
		//   e|N  existence  — written by create/drop ONLY (rename/move preserve existence).
		//                     Read by cascade dependents that FOLLOW a rename but are
		//                     destroyed by a drop (e.g. an existing index/pk on a column:
		//                     `DROP INDEX ix` breaks if the column is dropped, not renamed).
		// A write meeting a read-or-write of the same key is a conflict. Because alter
		// writes only `s|`, a name reference (`n|`) does NOT collide with an alter — the
		// two genuinely commute. Because rename writes `n|` but not `e|`, a cascade
		// reference (`e|`) does NOT collide with a rename. Both are exact, not conservative.
		const self = (k: string, ...p: string[]) => `s|${k}|${p.join('.')}`;
		const name = (k: string, ...p: string[]) => `n|${k}|${p.join('.')}`;
		const exist = (k: string, ...p: string[]) => `e|${k}|${p.join('.')}`;
		const created = (k: string, ...p: string[]) => [self(k, ...p), name(k, ...p), exist(k, ...p)]; // create/drop
		const endpoint = (k: string, ...p: string[]) => [self(k, ...p), name(k, ...p)]; // one endpoint of a rename/move
		const altered = (k: string, ...p: string[]) => [self(k, ...p)];
		const nref = (k: string, ...p: string[]) => name(k, ...p); // name reference (broken by rename OR drop)
		const eref = (k: string, ...p: string[]) => exist(k, ...p); // cascade reference (broken only by drop)
		const underTable = (schema: string, table: string) => [nref('tbl', schema, table), nref('sch', schema)];
		const colEnum = (column: Pick<Column, 'typeSchema' | 'type'>): string[] =>
			column.typeSchema && column.typeSchema !== 'pg_catalog' && column.type
				? [nref('enum', column.typeSchema, column.type)]
				: [];
		const idxCols = (cols: IndexColumn[], ref: (c: string) => string) =>
			cols.filter((c) => !c.isExpression).map((c) => ref(c.value));

		// A short name for the statement. The switch narrows it to one statement kind in every case.
		const s = statement;
		switch (s.type) {
			// ---- tables ----
			case 'create_table':
				return {
					owns: created('tbl', s.table.schema, s.table.name),
					needs: [nref('sch', s.table.schema), ...s.table.columns.flatMap(colEnum)],
				};
			case 'drop_table':
				return { owns: created('tbl', s.table.schema, s.table.name), needs: [nref('sch', s.table.schema)] };
			case 'rename_table':
				return {
					owns: [...endpoint('tbl', s.schema, s.from), ...endpoint('tbl', s.schema, s.to)],
					needs: [nref('sch', s.schema)],
				};
			case 'move_table':
				return {
					owns: [...endpoint('tbl', s.from, s.name), ...endpoint('tbl', s.to, s.name)],
					needs: [nref('sch', s.from), nref('sch', s.to)],
				};

			// ---- columns ----
			case 'add_column':
				return {
					owns: created('col', s.column.schema, s.column.table, s.column.name),
					needs: [...underTable(s.column.schema, s.column.table), ...colEnum(s.column)],
				};
			case 'drop_column':
				return {
					owns: created('col', s.column.schema, s.column.table, s.column.name),
					needs: underTable(s.column.schema, s.column.table),
				};
			case 'alter_column': {
				// The statement keeps the name and the existence of the column, so it only reads the name. It
				// writes one node for each property that its SQL changes or needs. SET NOT NULL and DROP NOT NULL
				// run in either order with a change of the type, the default or the generation expression. A change
				// of the type rewrites the default. An identity needs NOT NULL and no default. A generated column
				// takes no default.
				const d = s.diff;
				const properties = new Set<string>();
				if (d.notNull) properties.add('notNull');
				if (d.default) properties.add('default');
				if (d.type || d.typeSchema || d.dimensions) properties.add('type').add('default');
				if (d.generated) properties.add('generated').add('default');
				if (d.identity) properties.add('identity').add('default').add('notNull');
				const column = [s.to.schema, s.to.table, s.to.name] as const;
				return {
					owns: [...properties].flatMap((property) => altered('colprop', ...column, property)),
					needs: [
						...underTable(s.to.schema, s.to.table),
						nref('col', ...column),
						// Only SET DATA TYPE and SET DEFAULT name the type of the column in their SQL.
						...(properties.has('default') ? colEnum(s.to) : []),
					],
				};
			}
			case 'recreate_column': // DROP + re-ADD the column: destroys & re-establishes it (cascading its
				// indexes/constraints), so it writes existence like a create/drop, not just `self` like an alter
				return {
					owns: created('col', s.diff.schema, s.diff.table, s.diff.name),
					needs: underTable(s.diff.schema, s.diff.table),
				};
			case 'rename_column':
				return {
					owns: [
						...endpoint('col', s.from.schema, s.from.table, s.from.name),
						...endpoint('col', s.to.schema, s.to.table, s.to.name),
					],
					needs: underTable(s.from.schema, s.from.table),
				};

			// ---- indexes ----
			case 'create_index': // DDL hardcodes the columns -> NAME refs (break on rename)
				return {
					owns: created('idx', s.index.schema, s.index.name),
					needs: [
						...underTable(s.index.schema, s.index.table),
						...idxCols(s.index.columns, (c) => nref('col', s.index.schema, s.index.table, c)),
					],
				};
			case 'drop_index': // no columns in SQL, but cascaded by a column drop -> EXISTENCE refs
				return {
					owns: created('idx', s.index.schema, s.index.name),
					needs: [
						...underTable(s.index.schema, s.index.table),
						...idxCols(s.index.columns, (c) => eref('col', s.index.schema, s.index.table, c)),
					],
				};
			case 'recreate_index':
				return {
					owns: created('idx', s.diff.schema, s.diff.name),
					needs: [
						...underTable(s.index.schema, s.index.table),
						...idxCols(s.index.columns, (c) => nref('col', s.index.schema, s.index.table, c)),
					],
				};
			case 'rename_index': // rename follows column renames, cascaded by column drops -> EXISTENCE refs
				return {
					owns: [...endpoint('idx', s.schema, s.from), ...endpoint('idx', s.schema, s.to)],
					needs: [
						...underTable(s.schema, s.table),
						...s.columns.map((c) => eref('col', s.schema, s.table, c)),
					],
				};

			// ---- primary keys ----
			case 'add_pk': // `ADD PRIMARY KEY (c)` hardcodes columns -> NAME refs
				return {
					owns: created('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...s.pk.columns.map((c) => nref('col', s.pk.schema, s.pk.table, c)),
					],
				};
			case 'drop_pk': // cascaded by column drop -> EXISTENCE refs
				return {
					owns: created('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...s.pk.columns.map((c) => eref('col', s.pk.schema, s.pk.table, c)),
					],
				};
			case 'alter_pk':
				return {
					owns: altered('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...s.pk.columns.map((c) => nref('col', s.pk.schema, s.pk.table, c)),
					],
				};

			// ---- foreign keys ----
			case 'create_fk':
			case 'recreate_fk':
				return {
					owns: created('fk', s.fk.schema, s.fk.table, s.fk.name),
					needs: [
						...underTable(s.fk.schema, s.fk.table),
						nref('tbl', s.fk.schemaTo, s.fk.tableTo),
						nref('sch', s.fk.schemaTo),
						...s.fk.columns.map((c) => nref('col', s.fk.schema, s.fk.table, c)),
						...s.fk.columnsTo.map((c) => nref('col', s.fk.schemaTo, s.fk.tableTo, c)),
					],
				};
			case 'drop_fk':
				return {
					owns: created('fk', s.fk.schema, s.fk.table, s.fk.name),
					needs: [
						...underTable(s.fk.schema, s.fk.table),
						...s.fk.columns.map((c) => eref('col', s.fk.schema, s.fk.table, c)),
					],
				};

			// ---- unique constraints ----
			case 'add_unique':
				return {
					owns: created('uq', s.unique.schema, s.unique.table, s.unique.name),
					needs: [
						...underTable(s.unique.schema, s.unique.table),
						...s.unique.columns.map((c) => nref('col', s.unique.schema, s.unique.table, c)),
					],
				};
			case 'drop_unique':
				return {
					owns: created('uq', s.unique.schema, s.unique.table, s.unique.name),
					needs: [
						...underTable(s.unique.schema, s.unique.table),
						...s.unique.columns.map((c) => eref('col', s.unique.schema, s.unique.table, c)),
					],
				};
			case 'alter_unique': // recreated as DROP $left + ADD $right: name-ref the new cols, existence-ref the old
				return {
					owns: altered('uq', s.diff.schema, s.diff.table, s.diff.name),
					needs: [
						...underTable(s.diff.schema, s.diff.table),
						...s.diff.$right.columns.map((c) => nref('col', s.diff.schema, s.diff.table, c)),
						...s.diff.$left.columns.map((c) => eref('col', s.diff.schema, s.diff.table, c)),
					],
				};

			// ---- check constraints (columns come from parsing the CHECK expression) ----
			case 'add_check': // `ADD CHECK (c > 0)` hardcodes the columns -> NAME refs
				return {
					owns: created('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...s.columns.map((c) => nref('col', s.check.schema, s.check.table, c)),
					],
				};
			case 'drop_check': // cascaded by a column drop -> EXISTENCE refs
				return {
					owns: created('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...s.columns.map((c) => eref('col', s.check.schema, s.check.table, c)),
					],
				};
			case 'alter_check': // recreated as DROP old + ADD new: name-ref new expr cols, existence-ref old
				return {
					owns: altered('ck', s.diff.schema, s.diff.table, s.diff.name),
					needs: [
						...underTable(s.diff.schema, s.diff.table),
						...s.newColumns.map((c) => nref('col', s.diff.schema, s.diff.table, c)),
						...s.oldColumns.map((c) => eref('col', s.diff.schema, s.diff.table, c)),
					],
				};

			case 'rename_constraint': { // RENAME CONSTRAINT follows a column rename but is cascaded by a column drop -> EXISTENCE refs
				const needs = [
					...underTable(s.schema, s.table),
					...s.columns.map((c) => eref('col', s.schema, s.table, c)),
				];
				const named = (k: string) => ({
					owns: [...endpoint(k, s.schema, s.table, s.from), ...endpoint(k, s.schema, s.table, s.to)],
					needs,
				});
				switch (s.entityType) {
					case 'pks': // a table has one primary key, so the node of the key holds no name
						return { owns: endpoint('pk', s.schema, s.table), needs };
					case 'uniques':
						return named('uq');
					case 'checks':
						return named('ck');
					case 'fks':
						return named('fk');
					default: {
						const unhandled: never = s.entityType;
						throw new Error(`rename_constraint has the unknown constraint kind '${unhandled}'`);
					}
				}
			}

			// ---- enums (schema-scoped) ----
			case 'create_enum':
				return { owns: created('enum', s.enum.schema, s.enum.name), needs: [nref('sch', s.enum.schema)] };
			case 'drop_enum':
				return { owns: created('enum', s.enum.schema, s.enum.name), needs: [nref('sch', s.enum.schema)] };
			case 'rename_enum':
				return {
					owns: [...endpoint('enum', s.schema, s.from), ...endpoint('enum', s.schema, s.to)],
					needs: [nref('sch', s.schema)],
				};
			case 'alter_enum':
				return { owns: altered('enum', s.to.schema, s.to.name), needs: [nref('sch', s.to.schema)] };
			case 'recreate_enum': // DROP TYPE + CREATE TYPE, and an ALTER TABLE for every column of the type
				return {
					owns: created('enum', s.to.schema, s.to.name),
					needs: [
						nref('sch', s.to.schema),
						...s.columns.flatMap((c) => [...underTable(c.schema, c.table), nref('col', c.schema, c.table, c.name)]),
					],
				};
			case 'move_enum':
				return {
					owns: [
						...endpoint('enum', s.from.schema || 'public', s.from.name),
						...endpoint('enum', s.to.schema || 'public', s.to.name),
					],
					needs: [nref('sch', s.from.schema || 'public'), nref('sch', s.to.schema || 'public')],
				};

			// ---- sequences (schema-scoped) ----
			case 'create_sequence':
				return { owns: created('seq', s.sequence.schema, s.sequence.name), needs: [nref('sch', s.sequence.schema)] };
			case 'drop_sequence':
				return { owns: created('seq', s.sequence.schema, s.sequence.name), needs: [nref('sch', s.sequence.schema)] };
			case 'rename_sequence':
				return {
					owns: [...endpoint('seq', s.from.schema, s.from.name), ...endpoint('seq', s.to.schema, s.to.name)],
					needs: [nref('sch', s.from.schema)],
				};
			case 'alter_sequence':
				return { owns: altered('seq', s.sequence.schema, s.sequence.name), needs: [nref('sch', s.sequence.schema)] };
			case 'move_sequence':
				return {
					owns: [
						...endpoint('seq', s.from.schema || 'public', s.from.name),
						...endpoint('seq', s.to.schema || 'public', s.to.name),
					],
					needs: [nref('sch', s.from.schema || 'public'), nref('sch', s.to.schema || 'public')],
				};

			// ---- views (schema-scoped) ----
			case 'create_view':
				return { owns: created('view', s.view.schema, s.view.name), needs: [nref('sch', s.view.schema)] };
			case 'drop_view':
				return { owns: created('view', s.view.schema, s.view.name), needs: [nref('sch', s.view.schema)] };
			case 'rename_view':
				return {
					owns: [...endpoint('view', s.from.schema, s.from.name), ...endpoint('view', s.to.schema, s.to.name)],
					needs: [nref('sch', s.from.schema)],
				};
			case 'alter_view':
				return { owns: altered('view', s.view.schema, s.view.name), needs: [nref('sch', s.view.schema)] };
			case 'move_view':
				return {
					owns: [...endpoint('view', s.fromSchema, s.view.name), ...endpoint('view', s.toSchema, s.view.name)],
					needs: [nref('sch', s.fromSchema), nref('sch', s.toSchema)],
				};

			// ---- schemas (top level) ----
			case 'create_schema':
				return { owns: created('sch', s.name) };
			case 'drop_schema':
				return { owns: created('sch', s.name) };
			case 'rename_schema':
				return { owns: [...endpoint('sch', s.from.name), ...endpoint('sch', s.to.name)] };

			// ---- policies (children of the table) ----
			case 'create_policy':
				return {
					owns: created('pol', s.policy.schema, s.policy.table, s.policy.name),
					needs: underTable(s.policy.schema, s.policy.table),
				};
			case 'alter_policy':
			case 'recreate_policy':
				return {
					owns: altered('pol', s.policy.schema, s.policy.table, s.policy.name),
					needs: underTable(s.policy.schema, s.policy.table),
				};
			case 'drop_policy':
				return {
					owns: created('pol', s.policy.schema, s.policy.table, s.policy.name),
					needs: underTable(s.policy.schema, s.policy.table),
				};
			case 'rename_policy':
				return {
					owns: [
						...endpoint('pol', s.from.schema, s.from.table, s.from.name),
						...endpoint('pol', s.to.schema, s.to.table, s.to.name),
					],
					needs: underTable(s.from.schema, s.from.table),
				};

			// ---- RLS toggle (a child aspect of the table) ----
			case 'alter_rls':
				return { owns: altered('rls', s.schema, s.name), needs: underTable(s.schema, s.name) };

			// ---- roles (cluster level) ----
			case 'create_role':
				return { owns: created('role', s.role.name) };
			case 'alter_role':
				return { owns: altered('role', s.role.name) };
			case 'drop_role':
				return { owns: created('role', s.role.name) };
			case 'rename_role':
				return { owns: [...endpoint('role', s.from.name), ...endpoint('role', s.to.name)] };

			// ---- privileges ----
			case 'grant_privilege':
			case 'revoke_privilege':
			case 'regrant_privilege': {
				const { schema, table, grantee, grantor } = s.privilege;
				// ALL holds every other privilege type, so it claims each of them.
				const types = s.privilege.type === 'ALL' ? privilegeTypes : [s.privilege.type];
				return {
					owns: types.flatMap((type) => altered('priv', schema || '', table || '', grantee, type)),
					needs: [
						...(table ? underTable(schema || 'public', table) : []),
						nref('role', grantee),
						// GRANT names the grantor in GRANTED BY, and REVOKE does not.
						...(s.type === 'revoke_privilege' ? [] : [nref('role', grantor)]),
					],
				};
			}

			default: {
				// Exhaustiveness guard: `statement` is `never` here only when every
				// JsonStatement type has an explicit case above. Adding a new statement
				// type without handling it here is therefore a compile error — forcing
				// its footprint to be declared rather than silently defaulted.
				const unhandled: never = s;
				throw new Error(`buildFacetPaths: unhandled statement type '${(unhandled as { type: string }).type}'`);
			}
		}
	}

	public override async detectNonCommutative(snapshots: string[] | ParsedSnapshotInput[]) {
		const nodes = this.buildSnapshotGraph(snapshots);
		const byId = new Map(Object.values(nodes).map((node) => [node.id, node.raw]));
		return this.detectBranchConflicts(nodes, (id) => snapshotStatements(byId, byId.get(id)!));
	}

	protected override getDrySnapshot(): PostgresSnapshot {
		return drySnapshot;
	}
}

export const postgresCommutativity = new PostgresCommutativity();
