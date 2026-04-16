import {
	AbstractCommutativity,
	type CommutativityStatementDefinitions,
	type CommutativityStatementInfo,
} from '../../commutativity/engine';
import { createDDL, type MysqlDDL } from './ddl';
import { ddlDiffDry } from './diff';
import { drySnapshot, type MysqlSnapshot } from './snapshot';
import type { JsonStatement } from './statements';

type FootprintTarget = {
	objectName: string;
	columnName: string;
};

type StatementInfo = CommutativityStatementInfo<JsonStatement, FootprintTarget>;

type StatementDefinitions = CommutativityStatementDefinitions<
	JsonStatement,
	FootprintTarget
>;

function makeTarget(objectName: string, columnName = ''): FootprintTarget {
	return { objectName, columnName };
}

/**
 * MySQL-specific commutativity rules.
 *
 * How to read this file:
 * - `getStatementDefinitions()` is the main source of truth.
 * - Each statement definition answers two questions:
 *   1. `conflicts`: which other statement types are incompatible with this one.
 *   2. `buildInfo`: which resource footprints this statement occupies.
 * - `buildInfo().primary` is the exact resource touched by the statement.
 * - `buildInfo().ancestors` are explicit parent resources, usually the owning table.
 * - Unlike Postgres, MySQL has no extra schema-level ancestry here, so matching is
 *   driven by exact targets plus table ancestors.
 *
 * Practical guide for fixes:
 * - False positive or missed conflict for same-level objects like column->column,
 *   index->index, table->table, or view->view:
 *   change the `conflicts` array for the relevant statements in
 *   `getStatementDefinitions()`.
 * - False positive or missed conflict for parent/child relations like
 *   table->column or table->index:
 *   adjust the child's `ancestors` in `buildInfo()` and/or the parent's
 *   `conflicts` array.
 * - Wrong human-readable conflict message only:
 *   change `describeStatement()` or `schemaLevelActions`. Those affect reporting,
 *   not matching semantics.
 *
 * Rule of thumb:
 * - If the problem is "these two statement types should or should not conflict",
 *   edit `conflicts`.
 * - If the problem is "this statement is matched at the wrong scope",
 *   edit `primary` or `ancestors`.
 */
class MysqlCommutativity extends AbstractCommutativity<
	JsonStatement,
	MysqlSnapshot,
	FootprintTarget
> {
	private schemaLevelActions = new Set([
		'create_table',
		'drop_table',
		'rename_table',
		'create_view',
		'drop_view',
		'alter_view',
		'rename_view',
	]);

	protected override getStatementDefinitions(): StatementDefinitions {
		return {
			// Table operations
			create_table: {
				conflicts: ['create_table', 'drop_table', 'rename_table'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.table.name),
					ancestors: [],
				}),
			},
			drop_table: {
				conflicts: [
					'create_table',
					'drop_table',
					'rename_table',
					'add_column',
					'drop_column',
					'alter_column',
					'recreate_column',
					'rename_column',
					'create_index',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.table),
					ancestors: [],
				}),
			},
			rename_table: {
				conflicts: [
					'create_table',
					'drop_table',
					'rename_table',
					'create_index',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from),
					ancestors: [],
				}),
			},

			// Column operations
			add_column: {
				conflicts: [
					'add_column',
					'alter_column',
					'drop_column',
					'rename_column',
					'recreate_column',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.column.table, statement.column.name),
					ancestors: [makeTarget(statement.column.table)],
				}),
			},
			drop_column: {
				conflicts: [
					'add_column',
					'drop_column',
					'alter_column',
					'rename_column',
					'recreate_column',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.column.table, statement.column.name),
					ancestors: [makeTarget(statement.column.table)],
				}),
			},
			alter_column: {
				conflicts: [
					'add_column',
					'drop_column',
					'alter_column',
					'rename_column',
					'recreate_column',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.diff.table, statement.column.name),
					ancestors: [makeTarget(statement.diff.table)],
				}),
			},
			recreate_column: {
				conflicts: [
					'add_column',
					'drop_column',
					'alter_column',
					'recreate_column',
					'rename_column',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.column.table, statement.column.name),
					ancestors: [makeTarget(statement.column.table)],
				}),
			},
			rename_column: {
				conflicts: [
					'add_column',
					'drop_column',
					'alter_column',
					'recreate_column',
					'rename_column',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.table, statement.from),
					ancestors: [makeTarget(statement.table)],
				}),
			},

			// Index operations
			create_index: {
				conflicts: ['create_index', 'drop_index', 'drop_table'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.index.table, statement.index.name),
					ancestors: [makeTarget(statement.index.table)],
				}),
			},
			drop_index: {
				conflicts: ['create_index', 'drop_index'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.index.table, statement.index.name),
					ancestors: [makeTarget(statement.index.table)],
				}),
			},

			// Primary key operations
			drop_pk: {
				conflicts: ['drop_pk', 'create_pk'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.pk.table),
					ancestors: [],
				}),
			},
			create_pk: {
				conflicts: ['drop_pk', 'create_pk'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.pk.table),
					ancestors: [],
				}),
			},

			// Foreign key operations
			create_fk: {
				conflicts: ['create_fk', 'drop_constraint'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.fk.table),
					ancestors: [],
				}),
			},

			// Constraint operations (FK drops / check drops)
			drop_constraint: {
				conflicts: ['drop_constraint', 'create_fk', 'create_check'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.table),
					ancestors: [],
				}),
			},

			// Check constraint operations
			create_check: {
				conflicts: ['create_check', 'drop_constraint'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.check.table),
					ancestors: [],
				}),
			},

			// View operations
			create_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.name),
					ancestors: [],
				}),
			},
			drop_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.name),
					ancestors: [],
				}),
			},
			rename_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from),
					ancestors: [],
				}),
			},
			alter_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view', 'alter_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.name),
					ancestors: [],
				}),
			},
		};
	}

	protected override formatFootprintTarget(
		action: JsonStatement['type'],
		target: FootprintTarget,
	): string {
		return `${action};${target.objectName};${target.columnName}`;
	}

	protected override describeStatement(
		_statement: JsonStatement,
		info: StatementInfo,
	): string {
		if (this.schemaLevelActions.has(info.action)) {
			return `${info.action}: ${info.primary.objectName} in database`;
		}

		if (info.primary.columnName) {
			return `${info.action}: ${info.primary.columnName} on ${info.primary.objectName} table`;
		}

		return `${info.action} on ${info.primary.objectName} table`;
	}

	protected override getDrySnapshot(): MysqlSnapshot {
		return drySnapshot;
	}

	protected override async diffSnapshots(
		fromSnapshot: MysqlSnapshot,
		toSnapshot: MysqlSnapshot,
	): Promise<{ statements: JsonStatement[] }> {
		const fromDDL: MysqlDDL = createDDL();
		const toDDL: MysqlDDL = createDDL();

		for (const e of fromSnapshot.ddl) fromDDL.entities.push(e);
		for (const e of toSnapshot.ddl) toDDL.entities.push(e);

		const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
		return { statements };
	}
}

export const mysqlCommutativity = new MysqlCommutativity();
