import type { CheckHandlerResult } from 'src/cli/commands/check';
import { humanLog, mysqlSchemaError } from 'src/cli/views';
import type { CasingType } from '../../cli/validations/common';
import { assertUnreachable } from '../../utils';
import { findLeafSnapshotIds } from '../../utils/utils-node';
import type { MysqlDDL, SchemaError } from './ddl';
import { createDDL, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { MysqlSnapshot } from './snapshot';
import { drySnapshot, snapshotValidator } from './snapshot';
import type { JsonStatement } from './statements';

export const prepareSnapshot = async (
	snapshots: string[],
	filenames: string[],
	casing: CasingType | undefined,
	checkResult?: CheckHandlerResult,
): Promise<{
	ddlPrev: MysqlDDL;
	ddlCur: MysqlDDL;
	snapshot: MysqlSnapshot;
	snapshotPrev: MysqlSnapshot;
	custom: MysqlSnapshot;
	errors2: SchemaError[];
}> => {
	const { readFileSync } = await import('fs');
	const { randomUUID } = await import('crypto');
	const latestSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(
			JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()),
		);

	const branchParentSnapshot = checkResult?.parentSnapshot
		? snapshotValidator.strict(
			checkResult.parentSnapshot as Record<string, unknown>,
		)
		: null;
	const branchStatements = (checkResult?.statements ?? []) as JsonStatement[];
	const useBranchParent = branchParentSnapshot !== null && branchStatements.length > 0;
	const mergeLeafIds = (checkResult?.leafIds?.length ?? 0) > 1 ? checkResult?.leafIds : undefined;

	const prevSnapshot = useBranchParent
		? generateLatestSnapshot(branchParentSnapshot, branchStatements)
		: latestSnapshot;

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}
	const res = await prepareFromSchemaFiles(filenames);

	const interim = fromDrizzleSchema(res.tables, res.views, casing);

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(interim);

	if (errors2.length > 0) {
		humanLog(errors2.map((it) => mysqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const id = randomUUID();
	const prevIds = mergeLeafIds
		? mergeLeafIds
		: snapshots.length === 0
		? [prevSnapshot.id]
		: findLeafSnapshotIds(snapshots);

	const snapshot = {
		version: '6',
		dialect: 'mysql',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies MysqlSnapshot;

	const {
		id: _ignoredId,
		prevIds: _ignoredPrevIds,
		...prevRest
	} = prevSnapshot;

	const custom: MysqlSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return {
		ddlPrev,
		ddlCur,
		snapshot,
		snapshotPrev: prevSnapshot,
		custom,
		errors2,
	};
};

export function generateLatestSnapshot(
	snapshot: MysqlSnapshot,
	statements: JsonStatement[],
): MysqlSnapshot {
	const ddl = createDDL();
	for (const entry of snapshot.ddl) {
		ddl.entities.push(entry);
	}

	const clearMetaFields = <T>(value: T): T => {
		if (!value || typeof value !== 'object') {
			return value;
		}

		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).filter(
				([key]) => !key.startsWith('$'),
			),
		) as T;
	};

	const push = (entity: { push: (row: unknown) => unknown }, row: unknown) => {
		entity.push(clearMetaFields(row));
	};
	const del = (
		entity: { delete: (where?: unknown) => unknown },
		where: unknown,
	) => {
		entity.delete(clearMetaFields(where));
	};
	const replace = (
		entity: {
			delete: (where?: unknown) => unknown;
			push: (row: unknown) => unknown;
		},
		left: unknown,
		right: unknown,
	) => {
		del(entity, left);
		push(entity, right);
	};

	for (const statement of statements) {
		switch (statement.type) {
			case 'create_table': {
				const table = statement.table;
				ddl.tables.push({ name: table.name });
				for (const column of table.columns) {
					ddl.columns.push(column);
				}
				for (const index of table.indexes) {
					ddl.indexes.push(index);
				}
				if (table.pk) {
					ddl.pks.push(table.pk);
				}
				for (const fk of table.fks) {
					ddl.fks.push(fk);
				}
				for (const check of table.checks) {
					ddl.checks.push(check);
				}
				break;
			}
			case 'drop_table':
				ddl.tables.delete({ name: statement.table });
				ddl.columns.delete({ table: statement.table });
				ddl.indexes.delete({ table: statement.table });
				ddl.pks.delete({ table: statement.table });
				ddl.fks.delete({ table: statement.table });
				ddl.fks.delete({ tableTo: statement.table });
				ddl.checks.delete({ table: statement.table });
				break;
			case 'rename_table':
				ddl.tables.update({
					where: { name: statement.from },
					set: { name: statement.to },
				});
				ddl.columns.update({
					where: { table: statement.from },
					set: { table: statement.to },
				});
				ddl.indexes.update({
					where: { table: statement.from },
					set: { table: statement.to },
				});
				ddl.pks.update({
					where: { table: statement.from },
					set: { table: statement.to },
				});
				ddl.fks.update({
					where: { table: statement.from },
					set: { table: statement.to },
				});
				ddl.fks.update({
					where: { tableTo: statement.from },
					set: { tableTo: statement.to },
				});
				ddl.checks.update({
					where: { table: statement.from },
					set: { table: statement.to },
				});
				break;

			case 'add_column':
				push(ddl.columns, statement.column);
				break;
			case 'drop_column':
				del(ddl.columns, statement.column);
				break;
			case 'rename_column':
				ddl.columns.update({
					where: { table: statement.table, name: statement.from },
					set: { name: statement.to },
				});
				ddl.indexes.update({
					where: { table: statement.table },
					set: {
						columns: (column) =>
							column.value === statement.from
								? { ...column, value: statement.to }
								: column,
					},
				});
				ddl.pks.update({
					where: { table: statement.table },
					set: {
						columns: (column) => column === statement.from ? statement.to : column,
					},
				});
				ddl.fks.update({
					where: { table: statement.table },
					set: {
						columns: (column) => column === statement.from ? statement.to : column,
					},
				});
				ddl.fks.update({
					where: { tableTo: statement.table },
					set: {
						columnsTo: (column) => column === statement.from ? statement.to : column,
					},
				});
				break;
			case 'alter_column':
				replace(ddl.columns, statement.diff.$left, statement.column);
				break;
			case 'recreate_column':
				replace(ddl.columns, statement.diff.$left, statement.diff.$right);
				break;

			case 'create_index':
				push(ddl.indexes, statement.index);
				break;
			case 'drop_index':
				del(ddl.indexes, statement.index);
				break;

			case 'create_fk':
				push(ddl.fks, statement.fk);
				break;
			case 'create_pk':
				push(ddl.pks, statement.pk);
				break;
			case 'drop_pk':
				del(ddl.pks, statement.pk);
				break;
			case 'drop_constraint':
				ddl.fks.delete({ table: statement.table, name: statement.constraint });
				ddl.checks.delete({
					table: statement.table,
					name: statement.constraint,
				});
				if (statement.constraint === 'PRIMARY') {
					ddl.pks.delete({
						table: statement.table,
						name: statement.constraint,
					});
				}
				break;

			case 'create_view':
				push(ddl.views, statement.view);
				break;
			case 'drop_view':
				del(ddl.views, { name: statement.name });
				break;
			case 'rename_view':
				ddl.views.update({
					where: { name: statement.from },
					set: { name: statement.to },
				});
				break;
			case 'alter_view':
				replace(ddl.views, statement.diff.$left, statement.view);
				break;

			case 'create_check':
				push(ddl.checks, statement.check);
				break;

			default:
				assertUnreachable(statement);
		}
	}

	return {
		...snapshot,
		ddl: ddl.entities.list(),
	};
}
