import {
	AbstractCommutativity,
	type CommutativityStatementDefinitions,
	type CommutativityStatementInfo,
} from '../../commutativity/engine';
import { createDDL, type SQLiteDDL } from './ddl';
import { ddlDiffDry } from './diff';
import { drySqliteSnapshot, type SqliteSnapshot } from './snapshot';
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
 * SQLite-specific commutativity rules.
 *
 * How to read this file:
 * - `getStatementDefinitions()` is the main source of truth.
 * - Each statement definition answers two questions:
 *   1. `conflicts`: which other statement types are incompatible with this one.
 *   2. `buildInfo`: which resource footprints this statement occupies.
 * - `buildInfo().primary` is the exact resource touched by the statement.
 * - `buildInfo().ancestors` are explicit parent resources, usually the owning table.
 * - SQLite has no schemas, so matching is driven by exact targets plus table ancestors.
 *
 * Notes specific to SQLite:
 * - `recreate_table` is a compound statement produced by the diff engine when a
 *   table needs to be rebuilt (constraint changes, type changes, etc.). It
 *   broadly conflicts with anything that touches the table.
 * - `recreate_column` is used for column changes that require recreation
 *   (e.g. switching to/from a generated expression).
 *
 * Practical guide for fixes:
 * - False positive or missed conflict for same-level objects (column->column,
 *   index->index, table->table, view->view): edit the `conflicts` array.
 * - False positive or missed conflict for parent/child relations
 *   (table->column, table->index): adjust the child's `ancestors` and/or the
 *   parent's `conflicts` array.
 * - Wrong human-readable message only: change `describeStatement()` or
 *   `schemaLevelActions`. Those affect reporting, not matching semantics.
 */
class SqliteCommutativity extends AbstractCommutativity<
	JsonStatement,
	SqliteSnapshot,
	FootprintTarget
> {
	private schemaLevelActions = new Set<JsonStatement['type']>([
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'create_view',
		'drop_view',
		'rename_view',
	]);

	protected override getStatementDefinitions(): StatementDefinitions {
		return {
			// Table operations
			create_table: {
				conflicts: [
					'create_table',
					'drop_table',
					'rename_table',
					'recreate_table',
				],
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
					'recreate_table',
					'add_column',
					'drop_column',
					'recreate_column',
					'rename_column',
					'create_index',
					'drop_index',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.tableName),
					ancestors: [],
				}),
			},
			rename_table: {
				conflicts: [
					'create_table',
					'drop_table',
					'rename_table',
					'recreate_table',
					'create_index',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from),
					ancestors: [],
				}),
			},
			recreate_table: {
				conflicts: [
					'create_table',
					'drop_table',
					'rename_table',
					'recreate_table',
					'add_column',
					'drop_column',
					'recreate_column',
					'rename_column',
					'create_index',
					'drop_index',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.to.name),
					ancestors: [],
				}),
			},

			// Column operations
			add_column: {
				conflicts: [
					'add_column',
					'drop_column',
					'recreate_column',
					'rename_column',
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
					'recreate_column',
					'rename_column',
				],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.column.table, statement.column.name),
					ancestors: [makeTarget(statement.column.table)],
				}),
			},
			recreate_column: {
				conflicts: [
					'add_column',
					'drop_column',
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
				conflicts: ['create_index', 'drop_index'],
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

			// View operations
			create_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.name),
					ancestors: [],
				}),
			},
			drop_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.view.name),
					ancestors: [],
				}),
			},
			rename_view: {
				conflicts: ['create_view', 'drop_view', 'rename_view'],
				buildInfo: (statement) => ({
					primary: makeTarget(statement.from.name),
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

	protected override getDrySnapshot(): SqliteSnapshot {
		return drySqliteSnapshot;
	}

	protected override async diffSnapshots(
		fromSnapshot: SqliteSnapshot,
		toSnapshot: SqliteSnapshot,
	): Promise<{ statements: JsonStatement[] }> {
		const fromDDL: SQLiteDDL = createDDL();
		const toDDL: SQLiteDDL = createDDL();

		for (const e of fromSnapshot.ddl) fromDDL.entities.push(e);
		for (const e of toSnapshot.ddl) toDDL.entities.push(e);

		const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
		return { statements };
	}
}

export const sqliteCommutativity = new SqliteCommutativity();
