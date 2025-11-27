import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Column, MySqlSchemaV4, MySqlSchemaV5, Table } from '../../legacy/mysql-v5/mysqlSchema';
import type { Journal } from '../../utils';

export const upMysqlHandler = (out: string) => {
	// if there is meta folder - and there is a journal - it's version <8
	const metaPath = join(out, 'meta');
	const journalPath = join(metaPath, '_journal.json');
	if (existsSync(metaPath) && existsSync(journalPath)) {
		const journal: Journal = JSON.parse(readFileSync(journalPath).toString());
		if (Number(journal.version) < 8) {
			for (const entry of journal.entries) {
				const snapshotPrefix = entry.tag.split('_')[0];
				const oldSnapshot = readFileSync(join(metaPath, `${snapshotPrefix}_snapshot.json`));
				const oldSql = readFileSync(join(out, `${entry.tag}.sql`));

				writeFileSync(join(out, `${entry.tag}/snapshot.json`), oldSnapshot);
				writeFileSync(join(out, `${entry.tag}/migration.sql`), oldSql);

				unlinkSync(join(out, `${entry.tag}.sql`));
			}

			rmSync(metaPath);
		}
	}
};

export const upMySqlHandlerV4toV5 = (obj: MySqlSchemaV4): MySqlSchemaV5 => {
	const mappedTables: Record<string, Table> = {};

	for (const [key, table] of Object.entries(obj.tables)) {
		const mappedColumns: Record<string, Column> = {};
		for (const [ckey, column] of Object.entries(table.columns)) {
			let newDefault: any = column.default;
			let newType: string = column.type;
			let newAutoIncrement: boolean | undefined = column.autoincrement;

			if (column.type.toLowerCase().startsWith('datetime')) {
				if (typeof column.default !== 'undefined') {
					if (column.default.startsWith("'") && column.default.endsWith("'")) {
						newDefault = `'${
							column.default
								.substring(1, column.default.length - 1)
								.replace('T', ' ')
								.slice(0, 23)
						}'`;
					} else {
						newDefault = column.default.replace('T', ' ').slice(0, 23);
					}
				}

				newType = column.type.toLowerCase().replace('datetime (', 'datetime(');
			} else if (column.type.toLowerCase() === 'date') {
				if (typeof column.default !== 'undefined') {
					if (column.default.startsWith("'") && column.default.endsWith("'")) {
						newDefault = `'${
							column.default
								.substring(1, column.default.length - 1)
								.split('T')[0]
						}'`;
					} else {
						newDefault = column.default.split('T')[0];
					}
				}
				newType = column.type.toLowerCase().replace('date (', 'date(');
			} else if (column.type.toLowerCase().startsWith('timestamp')) {
				if (typeof column.default !== 'undefined') {
					if (column.default.startsWith("'") && column.default.endsWith("'")) {
						newDefault = `'${
							column.default
								.substring(1, column.default.length - 1)
								.replace('T', ' ')
								.slice(0, 23)
						}'`;
					} else {
						newDefault = column.default.replace('T', ' ').slice(0, 23);
					}
				}
				newType = column.type
					.toLowerCase()
					.replace('timestamp (', 'timestamp(');
			} else if (column.type.toLowerCase().startsWith('time')) {
				newType = column.type.toLowerCase().replace('time (', 'time(');
			} else if (column.type.toLowerCase().startsWith('decimal')) {
				newType = column.type.toLowerCase().replace(', ', ',');
			} else if (column.type.toLowerCase().startsWith('enum')) {
				newType = column.type.toLowerCase();
			} else if (column.type.toLowerCase().startsWith('serial')) {
				newAutoIncrement = true;
			}
			mappedColumns[ckey] = {
				...column,
				default: newDefault,
				type: newType,
				autoincrement: newAutoIncrement,
			};
		}

		mappedTables[key] = {
			...table,
			columns: mappedColumns,
			compositePrimaryKeys: {},
			uniqueConstraints: {},
			checkConstraint: {},
		};
	}

	return {
		version: '5',
		dialect: obj.dialect,
		id: obj.id,
		prevId: obj.prevId,
		tables: mappedTables,
		schemas: obj.schemas,
		_meta: {
			schemas: {} as Record<string, string>,
			tables: {} as Record<string, string>,
			columns: {} as Record<string, string>,
		},
	};
};
