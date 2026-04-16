import {
	AbstractCommutativity,
	type CommutativityStatementDefinitions,
	type CommutativityStatementInfo,
} from '../../commutativity/engine';
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
				conflicts: ['create_enum', 'drop_enum', 'rename_enum', 'recreate_enum', 'move_enum', 'alter_type_drop_value'],
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

	protected override getImplicitAncestors(target: FootprintTarget): FootprintTarget[] {
		if (target.schema === '' || (target.objectName === '' && target.columnName === '')) {
			return [];
		}

		return [makeSchemaTarget(target.schema)];
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

		for (const e of fromSnapshot.ddl) fromDDL.entities.push(e);
		for (const e of toSnapshot.ddl) toDDL.entities.push(e);

		const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
		return { statements };
	}
}

export const postgresCommutativity = new PostgresCommutativity();
