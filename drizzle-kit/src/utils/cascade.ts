import { SQLiteSchemaSquashed, SQLiteSquasher } from '../serializer/sqliteSchema';

export const collectCascadeDependents = (
	rootTable: string,
	json: SQLiteSchemaSquashed,
	action?: 'push',
): string[] => {
	const result = new Set<string>();
	const queue = [rootTable];

	while (queue.length) {
		const current = queue.pop()!;
		for (const table of Object.values(json.tables)) {
			for (const fk of Object.values(table.foreignKeys)) {
				const data = action === 'push'
					? SQLiteSquasher.unsquashPushFK(fk)
					: SQLiteSquasher.unsquashFK(fk);
				if (data.tableTo === current && data.onDelete === 'cascade') {
					if (!result.has(table.name)) {
						result.add(table.name);
						queue.push(table.name);
					}
				}
			}
		}
	}

	return Array.from(result);
};
