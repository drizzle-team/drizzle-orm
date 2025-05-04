import chalk from 'chalk';

import { JsonStatement } from 'src/jsonStatements';
import { findAddedAndRemoved, SQLiteDB } from 'src/utils';
import { SQLiteSchemaInternal, SQLiteSchemaSquashed, SQLiteSquasher } from '../../serializer/sqliteSchema';
import { fromJson, LibSQLModifyColumn, LibSQLRecreateTableConvertor } from '../../sqlgenerator';

export const getOldTableName = (
	tableName: string,
	meta: SQLiteSchemaInternal['_meta'],
) => {
	for (const key of Object.keys(meta.tables)) {
		const value = meta.tables[key];
		if (`"${tableName}"` === value) {
			return key.substring(1, key.length - 1);
		}
	}
	return tableName;
};

export const libSqlLogSuggestionsAndReturn = async (
	connection: SQLiteDB,
	statements: JsonStatement[],
	json1: SQLiteSchemaSquashed,
	json2: SQLiteSchemaSquashed,
	meta: SQLiteSchemaInternal['_meta'],
) => {
	let shouldAskForApprove = false;
	const statementsToExecute: string[] = [];
	const infoToPrint: string[] = [];

	const tablesToRemove: string[] = [];
	const columnsToRemove: string[] = [];
	const tablesToTruncate: string[] = [];

	for (const statement of statements) {
		if (statement.type === 'drop_table') {
			const res = await connection.query<{ count: string }>(
				`select count(*) as count from \`${statement.tableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(
							statement.tableName,
						)
					} table with ${count} items`,
				);
				tablesToRemove.push(statement.tableName);
				shouldAskForApprove = true;
			}
			const fromJsonStatement = fromJson([statement], 'turso', 'push', json2);
			statementsToExecute.push(
				...(Array.isArray(fromJsonStatement) ? fromJsonStatement : [fromJsonStatement]),
			);
		} else if (statement.type === 'alter_table_drop_column') {
			const tableName = statement.tableName;

			const res = await connection.query<{ count: string }>(
				`select count(*) as count from \`${tableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(
							statement.columnName,
						)
					} column in ${tableName} table with ${count} items`,
				);
				columnsToRemove.push(`${tableName}_${statement.columnName}`);
				shouldAskForApprove = true;
			}

			const fromJsonStatement = fromJson([statement], 'turso', 'push', json2);
			statementsToExecute.push(
				...(Array.isArray(fromJsonStatement) ? fromJsonStatement : [fromJsonStatement]),
			);
		} else if (
			statement.type === 'sqlite_alter_table_add_column'
			&& statement.column.notNull
			&& !statement.column.default
		) {
			const newTableName = statement.tableName;
			const res = await connection.query<{ count: string }>(
				`select count(*) as count from \`${newTableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to add not-null ${
						chalk.underline(
							statement.column.name,
						)
					} column without default value, which contains ${count} items`,
				);

				tablesToTruncate.push(newTableName);
				statementsToExecute.push(`delete from ${newTableName};`);

				shouldAskForApprove = true;
			}

			const fromJsonStatement = fromJson([statement], 'turso', 'push', json2);
			statementsToExecute.push(
				...(Array.isArray(fromJsonStatement) ? fromJsonStatement : [fromJsonStatement]),
			);
		} else if (statement.type === 'alter_table_alter_column_set_notnull') {
			const tableName = statement.tableName;

			if (
				statement.type === 'alter_table_alter_column_set_notnull'
				&& typeof statement.columnDefault === 'undefined'
			) {
				const res = await connection.query<{ count: string }>(
					`select count(*) as count from \`${tableName}\``,
				);
				const count = Number(res[0].count);
				if (count > 0) {
					infoToPrint.push(
						`· You're about to add not-null constraint to ${
							chalk.underline(
								statement.columnName,
							)
						} column without default value, which contains ${count} items`,
					);

					tablesToTruncate.push(tableName);
					statementsToExecute.push(`delete from \`${tableName}\``);
					shouldAskForApprove = true;
				}
			}

			const modifyStatements = new LibSQLModifyColumn().convert(statement, json2);

			statementsToExecute.push(
				...(Array.isArray(modifyStatements) ? modifyStatements : [modifyStatements]),
			);
		} else if (statement.type === 'recreate_table') {
			const tableName = statement.tableName;

			let dataLoss = false;

			const oldTableName = getOldTableName(tableName, meta);

			const prevColumnNames = Object.keys(json1.tables[oldTableName].columns);
			const currentColumnNames = Object.keys(json2.tables[tableName].columns);
			const { removedColumns, addedColumns } = findAddedAndRemoved(
				prevColumnNames,
				currentColumnNames,
			);

			if (removedColumns.length) {
				for (const removedColumn of removedColumns) {
					const res = await connection.query<{ count: string }>(
						`select count(\`${tableName}\`.\`${removedColumn}\`) as count from \`${tableName}\``,
					);

					const count = Number(res[0].count);
					if (count > 0) {
						infoToPrint.push(
							`· You're about to delete ${
								chalk.underline(
									removedColumn,
								)
							} column in ${tableName} table with ${count} items`,
						);
						columnsToRemove.push(removedColumn);
						shouldAskForApprove = true;
					}
				}
			}

			if (addedColumns.length) {
				for (const addedColumn of addedColumns) {
					const [res] = await connection.query<{ count: string }>(
						`select count(*) as count from \`${tableName}\``,
					);

					const columnConf = json2.tables[tableName].columns[addedColumn];

					const count = Number(res.count);
					if (count > 0 && columnConf.notNull && !columnConf.default) {
						dataLoss = true;

						infoToPrint.push(
							`· You're about to add not-null ${
								chalk.underline(
									addedColumn,
								)
							} column without default value to table, which contains ${count} items`,
						);
						shouldAskForApprove = true;
						tablesToTruncate.push(tableName);

						statementsToExecute.push(`DELETE FROM \`${tableName}\`;`);
					}
				}
			}

			// check if some tables referencing current for pragma
			const tablesReferencingCurrent: string[] = [];

			for (const table of Object.values(json2.tables)) {
				const tablesRefs = Object.values(json2.tables[table.name].foreignKeys)
					.filter((t) => SQLiteSquasher.unsquashPushFK(t).tableTo === tableName)
					.map((it) => SQLiteSquasher.unsquashPushFK(it).tableFrom);

				tablesReferencingCurrent.push(...tablesRefs);
			}

			// recreate table
			statementsToExecute.push(
				...new LibSQLRecreateTableConvertor().convert(statement, undefined, 'push', dataLoss),
			);
		} else if (
			statement.type === 'alter_table_alter_column_set_generated'
			|| statement.type === 'alter_table_alter_column_drop_generated'
		) {
			const tableName = statement.tableName;

			const res = await connection.query<{ count: string }>(
				`select count("${statement.columnName}") as count from \`${tableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(
							statement.columnName,
						)
					} column in ${tableName} table with ${count} items`,
				);
				columnsToRemove.push(`${tableName}_${statement.columnName}`);
				shouldAskForApprove = true;
			}
			const fromJsonStatement = fromJson([statement], 'turso', 'push', json2);
			statementsToExecute.push(
				...(Array.isArray(fromJsonStatement) ? fromJsonStatement : [fromJsonStatement]),
			);
		} else {
			const fromJsonStatement = fromJson([statement], 'turso', 'push', json2);
			statementsToExecute.push(
				...(Array.isArray(fromJsonStatement) ? fromJsonStatement : [fromJsonStatement]),
			);
		}
	}

	return {
		statementsToExecute: [...new Set(statementsToExecute)],
		shouldAskForApprove,
		infoToPrint,
		columnsToRemove: [...new Set(columnsToRemove)],
		tablesToTruncate: [...new Set(tablesToTruncate)],
		tablesToRemove: [...new Set(tablesToRemove)],
	};
};
