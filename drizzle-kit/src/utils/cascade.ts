import type { JsonRecreateTableCascadeDependent } from '../jsonStatements';
import { SQLiteSchemaSquashed, SQLiteSquasher } from '../serializer/sqliteSchema';

const encodeIdentifierPart = (value: string) => encodeURIComponent(value);

export const quoteSQLiteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export const getCascadeBackupTableName = (
	rootTable: string,
	dependentTable: string,
) => `__drizzle_cascade_backup_${encodeIdentifierPart(rootTable)}_${encodeIdentifierPart(dependentTable)}`;

export const collectCascadeDependents = (
	rootTable: string,
	fromSchema: SQLiteSchemaSquashed,
	toSchema: SQLiteSchemaSquashed,
	action?: 'push',
): JsonRecreateTableCascadeDependent[] => {
	const result: JsonRecreateTableCascadeDependent[] = [];
	const visited = new Set<string>([rootTable]);
	const queue = [rootTable];

	while (queue.length > 0) {
		const current = queue.pop();
		if (!current) continue;

		for (const table of Object.values(fromSchema.tables)) {
			for (const fk of Object.values(table.foreignKeys)) {
				const data = action === 'push'
					? SQLiteSquasher.unsquashPushFK(fk)
					: SQLiteSquasher.unsquashFK(fk);

				if (
					data.tableTo !== current
					|| data.onDelete !== 'cascade'
					|| visited.has(table.name)
					|| !fromSchema.tables[table.name]
				) {
					continue;
				}

				const newTable = toSchema.tables[table.name];
				if (!newTable) continue;
				const oldTable = table;
				const columns = Object.keys(oldTable.columns).filter(
					(column) => newTable.columns[column] && !newTable.columns[column].generated,
				);
				if (columns.length === 0) continue;

				visited.add(table.name);
				result.push({
					tableName: table.name,
					backupTableName: getCascadeBackupTableName(rootTable, table.name),
					columns,
				});
				queue.push(table.name);
			}
		}
	}

	return result;
};
