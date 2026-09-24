import {
	AbstractCommutativity,
	type CommutativityModel,
	type CommutativityStatementDefinitions,
	type CommutativityStatementInfo,
	type FacetPaths,
} from '../../commutativity/engine';
import type { ConflictTarget } from '../../commutativity/types';
import { createDDL, type PostgresDDL } from './ddl';
import { ddlDiffDry } from './diff';
import { drySnapshot, type PostgresSnapshot } from './snapshot';
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

/**
 * Postgres-specific commutativity rules.
 *
 * NOTE: conflict MATCHING now uses {@link PostgresCommutativity.buildFacetPaths}
 * (the facet model). The `conflicts` arrays below are no longer consulted for
 * matching; `getStatementDefinitions()` is retained only because `buildInfo`
 * still feeds the human-readable conflict reporting (describeStatement /
 * describeStatementTarget). The guide below describes the legacy conflict-list
 * model and is kept for reference.
 *
 * How to read this file:
 * - `getStatementDefinitions()` is the main source of truth.
 * - Each statement definition answers two questions:
 *   1. `conflicts`: which other statement types are incompatible with this one.
 *   2. `buildInfo`: which resource footprints this statement occupies.
 * - `buildInfo().primary` is the exact resource touched by the statement.
 * - `buildInfo().ancestors` are explicit parent resources, usually the owning table.
 * - `getImplicitAncestors()` adds the schema-level footprint for every schema-bound
 *   target, so schema operations can conflict with tables, columns, indexes, enums,
 *   views, and sequences inside that schema.
 *
 * Practical guide for fixes:
 * - False positive or missed conflict for same-level objects like column->column,
 *   index->index, table->table, enum->enum:
 *   change the `conflicts` array for the relevant statements in
 *   `getStatementDefinitions()`.
 * - False positive or missed conflict for parent/child relations like
 *   table->column or table->index:
 *   adjust the child's `ancestors` in `buildInfo()` and/or the parent's
 *   `conflicts` array.
 * - False positive or missed conflict for schema->table, schema->column,
 *   schema->index, schema->enum, schema->view, or schema->sequence:
 *   first check `schemaConflictTypes`, because that defines what schema
 *   operations conflict with. If schema ancestry itself is wrong, adjust
 *   `getImplicitAncestors()`.
 * - Wrong human-readable conflict message only:
 *   change `describeStatement()` or `schemaLevelActions`. Those affect reporting,
 *   not matching semantics.
 *
 * Rule of thumb:
 * - If the problem is "these two statement types should or should not conflict",
 *   edit `conflicts`.
 * - If the problem is "this statement is matched at the wrong scope",
 *   edit `primary`, `ancestors`, or `getImplicitAncestors()`.
 */
class PostgresCommutativity extends AbstractCommutativity<
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
		'alter_type_drop_value',
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
		'alter_type_drop_value',
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
					primary: makeTableTarget((statement as any).diff.schema, (statement as any).diff.table),
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
					'alter_type_drop_value',
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
					'alter_type_drop_value',
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
			alter_type_drop_value: {
				conflicts: ['drop_enum', 'alter_enum', 'alter_type_drop_value'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.enum.schema, statement.enum.name),
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
					primary: makeTableTarget((statement as any).schema, (statement as any).name),
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

	protected override formatFootprintTarget(
		action: JsonStatement['type'],
		target: FootprintTarget,
	): string {
		return `${action};${target.schema};${target.objectName};${target.columnName}`;
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
		'alter_type_drop_value',
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

	protected override getImplicitAncestors(target: FootprintTarget): FootprintTarget[] {
		if (target.schema === '' || (target.objectName === '' && target.columnName === '')) {
			return [];
		}

		return [makeSchemaTarget(target.schema)];
	}

	// ----------------------------------------------------------------------
	// Facet model — the model Postgres commutativity uses.
	//
	// Each statement declares the nodes it structurally owns, the existence it
	// destroys (drops), and the existence it needs (ancestors + cross-refs).
	// Node identity here mirrors the DDL's own `schema:table:name:entityType`
	// key, so children/cross-refs line up with the nodes drops remove.
	// ----------------------------------------------------------------------

	protected override getCommutativityModel(): CommutativityModel {
		return 'facet';
	}

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
		const colEnum = (column: any): string[] =>
			column?.typeSchema && column.typeSchema !== 'pg_catalog' && column.type
				? [nref('enum', column.typeSchema, column.type)]
				: [];
		const idxCols = (cols: any[] | undefined, ref: (c: string) => string) =>
			(cols ?? []).filter((c: any) => !c.isExpression).map((c: any) => ref(c.value));

		const s = statement as any;
		switch (statement.type) {
			// ---- tables ----
			case 'create_table':
				return { owns: created('tbl', s.table.schema, s.table.name), needs: [nref('sch', s.table.schema)] };
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
			case 'alter_column':
				// alter keeps the column's name & existence, so name/cascade refs to it commute
				return {
					owns: altered('col', s.to.schema, s.to.table, s.to.name),
					needs: [...underTable(s.to.schema, s.to.table), ...colEnum(s.to)],
				};
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
						...(s.columns ?? []).map((c: string) => eref('col', s.schema, s.table, c)),
					],
				};

			// ---- primary keys ----
			case 'add_pk': // `ADD PRIMARY KEY (c)` hardcodes columns -> NAME refs
				return {
					owns: created('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...(s.pk.columns ?? []).map((c: string) => nref('col', s.pk.schema, s.pk.table, c)),
					],
				};
			case 'drop_pk': // cascaded by column drop -> EXISTENCE refs
				return {
					owns: created('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...(s.pk.columns ?? []).map((c: string) => eref('col', s.pk.schema, s.pk.table, c)),
					],
				};
			case 'alter_pk':
				return {
					owns: altered('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...(s.pk.columns ?? []).map((c: string) => nref('col', s.pk.schema, s.pk.table, c)),
					],
				};

			// ---- foreign keys ----
			case 'create_fk':
			case 'recreate_fk':
				return {
					owns: created('fk', s.fk.schema, s.fk.table, s.fk.name),
					needs: [
						...underTable(s.fk.schema, s.fk.table),
						nref('tbl', s.fk.schemaTo ?? s.fk.schema, s.fk.tableTo),
						nref('sch', s.fk.schemaTo ?? s.fk.schema),
						...(s.fk.columns ?? []).map((c: string) => nref('col', s.fk.schema, s.fk.table, c)),
						...(s.fk.columnsTo ?? []).map((c: string) => nref('col', s.fk.schemaTo ?? s.fk.schema, s.fk.tableTo, c)),
					],
				};
			case 'drop_fk':
				return {
					owns: created('fk', s.fk.schema, s.fk.table, s.fk.name),
					needs: [
						...underTable(s.fk.schema, s.fk.table),
						...(s.fk.columns ?? []).map((c: string) => eref('col', s.fk.schema, s.fk.table, c)),
					],
				};

			// ---- unique constraints ----
			case 'add_unique':
				return {
					owns: created('uq', s.unique.schema, s.unique.table, s.unique.name),
					needs: [
						...underTable(s.unique.schema, s.unique.table),
						...(s.unique.columns ?? []).map((c: string) => nref('col', s.unique.schema, s.unique.table, c)),
					],
				};
			case 'drop_unique':
				return {
					owns: created('uq', s.unique.schema, s.unique.table, s.unique.name),
					needs: [
						...underTable(s.unique.schema, s.unique.table),
						...(s.unique.columns ?? []).map((c: string) => eref('col', s.unique.schema, s.unique.table, c)),
					],
				};
			case 'alter_unique': // recreated as DROP $left + ADD $right: name-ref the new cols, existence-ref the old
				return {
					owns: altered('uq', s.diff.schema, s.diff.table, s.diff.name),
					needs: [
						...underTable(s.diff.schema, s.diff.table),
						...(s.diff.$right?.columns ?? []).map((c: string) => nref('col', s.diff.schema, s.diff.table, c)),
						...(s.diff.$left?.columns ?? []).map((c: string) => eref('col', s.diff.schema, s.diff.table, c)),
					],
				};

			// ---- check constraints (columns come from parsing the CHECK expression) ----
			case 'add_check': // `ADD CHECK (c > 0)` hardcodes the columns -> NAME refs
				return {
					owns: created('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...(s.columns ?? []).map((c: string) => nref('col', s.check.schema, s.check.table, c)),
					],
				};
			case 'drop_check': // cascaded by a column drop -> EXISTENCE refs
				return {
					owns: created('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...(s.columns ?? []).map((c: string) => eref('col', s.check.schema, s.check.table, c)),
					],
				};
			case 'alter_check': // recreated as DROP old + ADD new: name-ref new expr cols, existence-ref old
				return {
					owns: altered('ck', s.diff.schema, s.diff.table, s.diff.name),
					needs: [
						...underTable(s.diff.schema, s.diff.table),
						...(s.newColumns ?? []).map((c: string) => nref('col', s.diff.schema, s.diff.table, c)),
						...(s.oldColumns ?? []).map((c: string) => eref('col', s.diff.schema, s.diff.table, c)),
					],
				};

			case 'rename_constraint': // RENAME CONSTRAINT follows a column rename but is cascaded by a column drop -> EXISTENCE refs
				return {
					owns: [
						...endpoint('uq', s.schema, s.table, s.from),
						...endpoint('ck', s.schema, s.table, s.from),
						...endpoint('fk', s.schema, s.table, s.from),
						...endpoint('uq', s.schema, s.table, s.to),
						...endpoint('ck', s.schema, s.table, s.to),
						...endpoint('fk', s.schema, s.table, s.to),
					],
					needs: [
						...underTable(s.schema, s.table),
						...(s.columns ?? []).map((c: string) => eref('col', s.schema, s.table, c)),
					],
				};

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
			case 'recreate_enum':
				return { owns: altered('enum', s.to.schema, s.to.name), needs: [nref('sch', s.to.schema)] };
			case 'move_enum':
				return {
					owns: [
						...endpoint('enum', s.from.schema || 'public', s.from.name),
						...endpoint('enum', s.to.schema || 'public', s.to.name),
					],
					needs: [nref('sch', s.from.schema || 'public'), nref('sch', s.to.schema || 'public')],
				};
			case 'alter_type_drop_value':
				return { owns: altered('enum', s.enum.schema, s.enum.name), needs: [nref('sch', s.enum.schema)] };

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
			case 'regrant_privilege':
				return {
					owns: altered('priv', s.privilege.schema || '', s.privilege.table || ''),
					needs: s.privilege.table ? underTable(s.privilege.schema || 'public', s.privilege.table) : [],
				};

			default: {
				// Exhaustiveness guard: `statement` is `never` here only when every
				// JsonStatement type has an explicit case above. Adding a new statement
				// type without handling it here is therefore a compile error — forcing
				// its footprint to be declared rather than silently defaulted.
				const unhandled: never = statement;
				throw new Error(`buildFacetPaths: unhandled statement type '${(unhandled as { type: string }).type}'`);
			}
		}
	}

	protected override getDrySnapshot(): PostgresSnapshot {
		return drySnapshot;
	}

	protected override async diffSnapshots(
		fromSnapshot: PostgresSnapshot,
		toSnapshot: PostgresSnapshot,
	): Promise<{ statements: JsonStatement[] }> {
		const fromDDL: PostgresDDL = createDDL();
		const toDDL: PostgresDDL = createDDL();

		fromDDL.entities.pushAll(fromSnapshot.ddl);
		toDDL.entities.pushAll(toSnapshot.ddl);

		const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
		return { statements };
	}
}

export const postgresCommutativity = new PostgresCommutativity();
