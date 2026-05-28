import type { CheckHandlerResult } from '../../cli/commands/check';
import { sqliteSchemaError } from '../../cli/views';
import { assertUnreachable } from '../../utils';
import { findLeafSnapshotIds } from '../../utils/utils-node';
import type { Column, ForeignKey, Index, PrimaryKey, SQLiteDDL, UniqueConstraint } from './ddl';
import { createDDL, fromEntities, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { SqliteSnapshot } from './snapshot';
import { drySqliteSnapshot, snapshotValidator } from './snapshot';
import type { JsonStatement } from './statements';

export const prepareSqliteSnapshot = async (
	snapshots: string[],
	filenames: string[],
	checkResult?: CheckHandlerResult,
): Promise<{
	ddlPrev: SQLiteDDL;
	ddlCur: SQLiteDDL;
	snapshot: SqliteSnapshot;
	snapshotPrev: SqliteSnapshot;
	custom: SqliteSnapshot;
}> => {
	const { readFileSync } = await import('fs');
	const { randomUUID } = await import('crypto');
	const latestSnapshot = snapshots.length === 0
		? drySqliteSnapshot
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
		? generateLatestSnapshot(branchParentSnapshot!, branchStatements)
		: latestSnapshot;

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}

	const { tables, views } = await prepareFromSchemaFiles(filenames);
	const interim = fromDrizzleSchema(tables, views);

	const { ddl: ddlCur, errors } = interimToDDL(interim);

	if (errors.length > 0) {
		console.log(errors.map((it) => sqliteSchemaError(it)).join('\n\n'));
		process.exit();
	}

	const id = randomUUID();
	const prevIds = mergeLeafIds
		? mergeLeafIds
		: snapshots.length === 0
		? [prevSnapshot.id]
		: findLeafSnapshotIds(snapshots);

	const snapshot = {
		version: '7',
		dialect: 'sqlite',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies SqliteSnapshot;

	const {
		id: _ignoredId,
		prevIds: _ignoredPrevIds,
		...prevRest
	} = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: SqliteSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};

/**
 * Apply a list of JSON statements to a parent snapshot to derive the equivalent
 * "latest" snapshot. Used to materialize the prev snapshot when generating a
 * migration on top of a fork: the parent snapshot plus the merged statements
 * from each open leaf form the effective parent for diffing the schema.
 */
export function generateLatestSnapshot(
	snapshot: SqliteSnapshot,
	statements: JsonStatement[],
): SqliteSnapshot {
	const ddl = fromEntities(snapshot.ddl.map((it) => ({ ...it })));

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

	const dropTable = (name: string) => {
		ddl.tables.delete({ name });
		ddl.columns.delete({ table: name });
		ddl.indexes.delete({ table: name });
		ddl.pks.delete({ table: name });
		ddl.fks.delete({ table: name });
		ddl.fks.delete({ tableTo: name });
		ddl.uniques.delete({ table: name });
		ddl.checks.delete({ table: name });
	};

	const insertTableFull = (table: {
		name: string;
		columns: Column[];
		indexes: Index[];
		pk: PrimaryKey | null;
		fks: ForeignKey[];
		uniques: UniqueConstraint[];
		checks: { table: string; value: string; name?: string }[];
	}) => {
		ddl.tables.push({ name: table.name });
		for (const column of table.columns) push(ddl.columns, column);
		for (const index of table.indexes) push(ddl.indexes, index);
		if (table.pk) push(ddl.pks, table.pk);
		for (const fk of table.fks) push(ddl.fks, fk);
		for (const unique of table.uniques) push(ddl.uniques, unique);
		for (const check of table.checks) push(ddl.checks, check);
	};

	for (const statement of statements) {
		switch (statement.type) {
			case 'create_table':
				insertTableFull(statement.table);
				break;
			case 'drop_table':
				dropTable(statement.tableName);
				break;
			case 'rename_table':
				ddl.tables.update({
					where: { name: statement.from },
					set: { name: statement.to },
				});
				ddl.entities.update({
					where: { table: statement.from },
					set: { table: statement.to },
				});
				ddl.fks.update({
					where: { tableTo: statement.from },
					set: { tableTo: statement.to },
				});
				break;
			case 'recreate_table': {
				dropTable(statement.from.name);
				insertTableFull(statement.to);
				break;
			}

			case 'add_column':
				push(ddl.columns, statement.column);
				if (statement.fk) push(ddl.fks, statement.fk);
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
							!column.isExpression && column.value === statement.from
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
				ddl.uniques.update({
					where: { table: statement.table },
					set: {
						columns: (column) => column === statement.from ? statement.to : column,
					},
				});
				break;
			case 'recreate_column':
				replace(
					ddl.columns,
					{ table: statement.column.table, name: statement.column.name },
					statement.column,
				);
				if (statement.fk) push(ddl.fks, statement.fk);
				break;

			case 'create_index':
				push(ddl.indexes, statement.index);
				break;
			case 'drop_index':
				del(ddl.indexes, statement.index);
				break;

			case 'create_view':
				push(ddl.views, statement.view);
				break;
			case 'drop_view':
				del(ddl.views, { name: statement.view.name });
				break;
			case 'rename_view':
				ddl.views.update({
					where: { name: statement.from.name },
					set: { name: statement.to.name },
				});
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
