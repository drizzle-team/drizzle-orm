import {
	JsonCreateIndexStatement,
	JsonRecreateTableStatement,
	JsonStatement,
	prepareCreateIndexesJson,
} from './jsonStatements';
import { SingleStoreSchemaSquashed } from './serializer/singlestoreSchema';
import { SQLiteSchemaSquashed, SQLiteSquasher } from './serializer/sqliteSchema';

export const prepareLibSQLRecreateTable = (
	table: SQLiteSchemaSquashed['tables'][keyof SQLiteSchemaSquashed['tables']],
	action?: 'push',
): (JsonRecreateTableStatement | JsonCreateIndexStatement)[] => {
	const { name, columns, uniqueConstraints, indexes, checkConstraints } = table;

	const composites: string[][] = Object.values(table.compositePrimaryKeys).map(
		(it) => SQLiteSquasher.unsquashPK(it),
	);

	const references: string[] = Object.values(table.foreignKeys);
	const fks = references.map((it) =>
		action === 'push' ? SQLiteSquasher.unsquashPushFK(it) : SQLiteSquasher.unsquashFK(it)
	);

	const statements: (JsonRecreateTableStatement | JsonCreateIndexStatement)[] = [
		{
			type: 'recreate_table',
			tableName: name,
			columns: Object.values(columns),
			compositePKs: composites,
			referenceData: fks,
			uniqueConstraints: Object.values(uniqueConstraints),
			checkConstraints: Object.values(checkConstraints),
		},
	];

	if (Object.keys(indexes).length) {
		statements.push(...prepareCreateIndexesJson(name, '', indexes));
	}
	return statements;
};

export const prepareSQLiteRecreateTable = (
	table: SQLiteSchemaSquashed['tables'][keyof SQLiteSchemaSquashed['tables']],
	action?: 'push',
): JsonStatement[] => {
	const { name, columns, uniqueConstraints, indexes, checkConstraints } = table;

	const composites: string[][] = Object.values(table.compositePrimaryKeys).map(
		(it) => SQLiteSquasher.unsquashPK(it),
	);

	const references: string[] = Object.values(table.foreignKeys);
	const fks = references.map((it) =>
		action === 'push' ? SQLiteSquasher.unsquashPushFK(it) : SQLiteSquasher.unsquashFK(it)
	);

	const statements: JsonStatement[] = [
		{
			type: 'recreate_table',
			tableName: name,
			columns: Object.values(columns),
			compositePKs: composites,
			referenceData: fks,
			uniqueConstraints: Object.values(uniqueConstraints),
			checkConstraints: Object.values(checkConstraints),
		},
	];

	if (Object.keys(indexes).length) {
		statements.push(...prepareCreateIndexesJson(name, '', indexes));
	}
	return statements;
};

export const libSQLCombineStatements = (
	statements: JsonStatement[],
	json2: SQLiteSchemaSquashed,
	action?: 'push',
) => {
	// const tablesContext: Record<string, string[]> = {};
	const newStatements: Record<string, JsonStatement[]> = {};
	for (const statement of statements) {
		if (
			statement.type === 'alter_table_alter_column_drop_autoincrement'
			|| statement.type === 'alter_table_alter_column_set_autoincrement'
			|| statement.type === 'alter_table_alter_column_drop_pk'
			|| statement.type === 'alter_table_alter_column_set_pk'
			|| statement.type === 'create_composite_pk'
			|| statement.type === 'alter_composite_pk'
			|| statement.type === 'delete_composite_pk'
			|| statement.type === 'create_check_constraint'
			|| statement.type === 'delete_check_constraint'
		) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareLibSQLRecreateTable(json2.tables[tableName], action);

				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareLibSQLRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (
			statement.type === 'alter_table_alter_column_set_type'
			|| statement.type === 'alter_table_alter_column_drop_notnull'
			|| statement.type === 'alter_table_alter_column_set_notnull'
			|| statement.type === 'alter_table_alter_column_set_default'
			|| statement.type === 'alter_table_alter_column_drop_default'
		) {
			const { tableName, columnName, columnPk } = statement;

			const columnIsPartOfForeignKey = Object.values(
				json2.tables[tableName].foreignKeys,
			).some((it) => {
				const unsquashFk = action === 'push' ? SQLiteSquasher.unsquashPushFK(it) : SQLiteSquasher.unsquashFK(it);

				return (
					unsquashFk.columnsFrom.includes(columnName)
				);
			});

			const statementsForTable = newStatements[tableName];

			if (
				!statementsForTable && (columnIsPartOfForeignKey || columnPk)
			) {
				newStatements[tableName] = prepareLibSQLRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (
				statementsForTable && (columnIsPartOfForeignKey || columnPk)
			) {
				if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
					const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
					const preparedStatements = prepareLibSQLRecreateTable(json2.tables[tableName], action);

					if (wasRename) {
						newStatements[tableName].push(...preparedStatements);
					} else {
						newStatements[tableName] = preparedStatements;
					}
				}
				continue;
			}
			if (
				statementsForTable && !(columnIsPartOfForeignKey || columnPk)
			) {
				if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
					newStatements[tableName].push(statement);
				}
				continue;
			}

			newStatements[tableName] = [statement];

			continue;
		}

		if (statement.type === 'create_reference') {
			const tableName = statement.tableName;

			const data = action === 'push'
				? SQLiteSquasher.unsquashPushFK(statement.data)
				: SQLiteSquasher.unsquashFK(statement.data);

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = statement.isMulticolumn
					? prepareLibSQLRecreateTable(json2.tables[tableName], action)
					: [statement];

				continue;
			}

			// if add column with reference -> skip create_reference statement
			if (
				!statement.isMulticolumn
				&& statementsForTable.some((st) =>
					st.type === 'sqlite_alter_table_add_column' && st.column.name === data.columnsFrom[0]
				)
			) {
				continue;
			}

			if (statement.isMulticolumn) {
				if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
					const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
					const preparedStatements = prepareLibSQLRecreateTable(json2.tables[tableName], action);

					if (wasRename) {
						newStatements[tableName].push(...preparedStatements);
					} else {
						newStatements[tableName] = preparedStatements;
					}

					continue;
				}

				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				newStatements[tableName].push(statement);
			}

			continue;
		}

		if (statement.type === 'delete_reference') {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareLibSQLRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareLibSQLRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (statement.type === 'sqlite_alter_table_add_column' && statement.column.primaryKey) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareLibSQLRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareLibSQLRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		const tableName = statement.type === 'rename_table'
			? statement.tableNameTo
			: (statement as { tableName: string }).tableName;
		const statementsForTable = newStatements[tableName];

		if (!statementsForTable) {
			newStatements[tableName] = [statement];
			continue;
		}

		if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
			newStatements[tableName].push(statement);
		}
	}

	const combinedStatements = Object.values(newStatements).flat();
	const renamedTables = combinedStatements.filter((it) => it.type === 'rename_table');
	const renamedColumns = combinedStatements.filter((it) => it.type === 'alter_table_rename_column');

	const rest = combinedStatements.filter((it) => it.type !== 'rename_table' && it.type !== 'alter_table_rename_column');

	return [...renamedTables, ...renamedColumns, ...rest];
};

export const sqliteCombineStatements = (
	statements: JsonStatement[],
	json2: SQLiteSchemaSquashed,
	action?: 'push',
) => {
	// const tablesContext: Record<string, string[]> = {};
	const newStatements: Record<string, JsonStatement[]> = {};
	for (const statement of statements) {
		if (
			statement.type === 'alter_table_alter_column_set_type'
			|| statement.type === 'alter_table_alter_column_set_default'
			|| statement.type === 'alter_table_alter_column_drop_default'
			|| statement.type === 'alter_table_alter_column_set_notnull'
			|| statement.type === 'alter_table_alter_column_drop_notnull'
			|| statement.type === 'alter_table_alter_column_drop_autoincrement'
			|| statement.type === 'alter_table_alter_column_set_autoincrement'
			|| statement.type === 'alter_table_alter_column_drop_pk'
			|| statement.type === 'alter_table_alter_column_set_pk'
			|| statement.type === 'delete_reference'
			|| statement.type === 'alter_reference'
			|| statement.type === 'create_composite_pk'
			|| statement.type === 'alter_composite_pk'
			|| statement.type === 'delete_composite_pk'
			|| statement.type === 'create_unique_constraint'
			|| statement.type === 'delete_unique_constraint'
			|| statement.type === 'create_check_constraint'
			|| statement.type === 'delete_check_constraint'
		) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSQLiteRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSQLiteRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (statement.type === 'sqlite_alter_table_add_column' && statement.column.primaryKey) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSQLiteRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSQLiteRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (statement.type === 'create_reference') {
			const tableName = statement.tableName;

			const data = action === 'push'
				? SQLiteSquasher.unsquashPushFK(statement.data)
				: SQLiteSquasher.unsquashFK(statement.data);
			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSQLiteRecreateTable(json2.tables[tableName], action);
				continue;
			}

			// if add column with reference -> skip create_reference statement
			if (
				data.columnsFrom.length === 1
				&& statementsForTable.some((st) =>
					st.type === 'sqlite_alter_table_add_column' && st.column.name === data.columnsFrom[0]
				)
			) {
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSQLiteRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		const tableName = statement.type === 'rename_table'
			? statement.tableNameTo
			: (statement as { tableName: string }).tableName;

		const statementsForTable = newStatements[tableName];

		if (!statementsForTable) {
			newStatements[tableName] = [statement];
			continue;
		}

		if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
			newStatements[tableName].push(statement);
		}
	}

	const combinedStatements = Object.values(newStatements).flat();

	const renamedTables = combinedStatements.filter((it) => it.type === 'rename_table');
	const renamedColumns = combinedStatements.filter((it) => it.type === 'alter_table_rename_column');

	const rest = combinedStatements.filter((it) => it.type !== 'rename_table' && it.type !== 'alter_table_rename_column');

	return [...renamedTables, ...renamedColumns, ...rest];
};

export const prepareSingleStoreRecreateTable = (
	table: SingleStoreSchemaSquashed['tables'][keyof SingleStoreSchemaSquashed['tables']],
): JsonStatement[] => {
	const { name, columns, uniqueConstraints, indexes, compositePrimaryKeys } = table;

	const composites: string[] = Object.values(compositePrimaryKeys);

	const statements: JsonStatement[] = [
		{
			type: 'singlestore_recreate_table',
			tableName: name,
			columns: Object.values(columns),
			compositePKs: composites,
			uniqueConstraints: Object.values(uniqueConstraints),
		},
	];

	if (Object.keys(indexes).length) {
		statements.push(...prepareCreateIndexesJson(name, '', indexes));
	}
	return statements;
};

export const singleStoreCombineStatements = (
	statements: JsonStatement[],
	json2: SingleStoreSchemaSquashed,
) => {
	const newStatements: Record<string, JsonStatement[]> = {};

	for (const statement of statements) {
		if (
			statement.type === 'alter_table_alter_column_set_type'
			|| statement.type === 'alter_table_alter_column_set_notnull'
			|| statement.type === 'alter_table_alter_column_drop_notnull'
			|| statement.type === 'alter_table_alter_column_drop_autoincrement'
			|| statement.type === 'alter_table_alter_column_set_autoincrement'
			|| statement.type === 'alter_table_alter_column_drop_pk'
			|| statement.type === 'alter_table_alter_column_set_pk'
			|| statement.type === 'create_composite_pk'
			|| statement.type === 'alter_composite_pk'
			|| statement.type === 'delete_composite_pk'
		) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSingleStoreRecreateTable(json2.tables[tableName]);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) =>
					type === 'rename_table' || type === 'alter_table_rename_column'
				);
				const preparedStatements = prepareSingleStoreRecreateTable(json2.tables[tableName]);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (
			(statement.type === 'alter_table_alter_column_drop_default'
				|| statement.type === 'alter_table_alter_column_set_default') && statement.columnNotNull
		) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSingleStoreRecreateTable(json2.tables[tableName]);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSingleStoreRecreateTable(json2.tables[tableName]);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (statement.type === 'alter_table_add_column' && statement.column.primaryKey) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSingleStoreRecreateTable(json2.tables[tableName]);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSingleStoreRecreateTable(json2.tables[tableName]);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		const tableName = statement.type === 'rename_table'
			? statement.tableNameTo
			: (statement as { tableName: string }).tableName;

		const statementsForTable = newStatements[tableName];

		if (!statementsForTable) {
			newStatements[tableName] = [statement];
			continue;
		}

		if (!statementsForTable.some(({ type }) => type === 'singlestore_recreate_table')) {
			newStatements[tableName].push(statement);
		}
	}

	const combinedStatements = Object.values(newStatements).flat();

	const renamedTables = combinedStatements.filter((it) => it.type === 'rename_table');
	const renamedColumns = combinedStatements.filter((it) => it.type === 'alter_table_rename_column');

	const rest = combinedStatements.filter((it) => it.type !== 'rename_table' && it.type !== 'alter_table_rename_column');

	return [...renamedTables, ...renamedColumns, ...rest];
};
