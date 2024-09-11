import chalk from 'chalk';

import { SQLiteSchemaInternal, SQLiteSchemaSquashed, SQLiteSquasher } from '../../serializer/sqliteSchema';
import {
	CreateSqliteIndexConvertor,
	fromJson,
	SQLiteCreateTableConvertor,
	SQLiteDropTableConvertor,
	SqliteRenameTableConvertor,
} from '../../sqlgenerator';

import type { JsonStatement } from '../../jsonStatements';
import type { DB, SQLiteDB } from '../../utils';

export const _moveDataStatements = (
	tableName: string,
	json: SQLiteSchemaSquashed,
	dataLoss: boolean = false,
) => {
	const statements: string[] = [];

	// rename table to __old_${tablename}
	statements.push(
		new SqliteRenameTableConvertor().convert({
			type: 'rename_table',
			tableNameFrom: tableName,
			tableNameTo: `__old_push_${tableName}`,
			fromSchema: '',
			toSchema: '',
		}),
	);

	// create table statement from a new json2 with proper name
	const tableColumns = Object.values(json.tables[tableName].columns);
	const referenceData = Object.values(json.tables[tableName].foreignKeys);
	const compositePKs = Object.values(
		json.tables[tableName].compositePrimaryKeys,
	).map((it) => SQLiteSquasher.unsquashPK(it));

	const fks = referenceData.map((it) => SQLiteSquasher.unsquashPushFK(it));

	statements.push(
		new SQLiteCreateTableConvertor().convert({
			type: 'sqlite_create_table',
			tableName: tableName,
			columns: tableColumns,
			referenceData: fks,
			compositePKs,
		}),
	);

	// move data
	if (!dataLoss) {
		statements.push(
			`INSERT INTO "${tableName}" SELECT * FROM "__old_push_${tableName}";`,
		);
	}
	// drop table with name __old_${tablename}
	statements.push(
		new SQLiteDropTableConvertor().convert({
			type: 'drop_table',
			tableName: `__old_push_${tableName}`,
			schema: '',
		}),
	);

	for (const idx of Object.values(json.tables[tableName].indexes)) {
		statements.push(
			new CreateSqliteIndexConvertor().convert({
				type: 'create_index',
				tableName: tableName,
				schema: '',
				data: idx,
			}),
		);
	}

	return statements;
};

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

export const getNewTableName = (
	tableName: string,
	meta: SQLiteSchemaInternal['_meta'],
) => {
	if (typeof meta.tables[`"${tableName}"`] !== 'undefined') {
		return meta.tables[`"${tableName}"`].substring(
			1,
			meta.tables[`"${tableName}"`].length - 1,
		);
	}
	return tableName;
};

export const logSuggestionsAndReturn = async (
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
	const schemasToRemove: string[] = [];
	const tablesToTruncate: string[] = [];

	const tablesContext: Record<string, string[]> = {};

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
			const stmnt = fromJson([statement], 'sqlite')[0];
			statementsToExecute.push(stmnt);
		} else if (statement.type === 'alter_table_drop_column') {
			const newTableName = getOldTableName(statement.tableName, meta);

			const columnIsPartOfPk = Object.values(
				json1.tables[newTableName].compositePrimaryKeys,
			).find((c) => SQLiteSquasher.unsquashPK(c).includes(statement.columnName));

			const columnIsPartOfIndex = Object.values(
				json1.tables[newTableName].indexes,
			).find((c) => SQLiteSquasher.unsquashIdx(c).columns.includes(statement.columnName));

			const columnIsPk = json1.tables[newTableName].columns[statement.columnName].primaryKey;

			const columnIsPartOfFk = Object.values(
				json1.tables[newTableName].foreignKeys,
			).find((t) =>
				SQLiteSquasher.unsquashPushFK(t).columnsFrom.includes(
					statement.columnName,
				)
			);

			const res = await connection.query<{ count: string }>(
				`select count(*) as count from \`${newTableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(
							statement.columnName,
						)
					} column in ${newTableName} table with ${count} items`,
				);
				columnsToRemove.push(`${newTableName}_${statement.columnName}`);
				shouldAskForApprove = true;
			}

			if (
				columnIsPk
				|| columnIsPartOfPk
				|| columnIsPartOfIndex
				|| columnIsPartOfFk
			) {
				tablesContext[newTableName] = [
					..._moveDataStatements(statement.tableName, json2, true),
				];
				// check table that have fk to this table

				const tablesReferencingCurrent: string[] = [];

				for (const table of Object.values(json1.tables)) {
					const tablesRefs = Object.values(json1.tables[table.name].foreignKeys)
						.filter(
							(t) => SQLiteSquasher.unsquashPushFK(t).tableTo === newTableName,
						)
						.map((t) => SQLiteSquasher.unsquashPushFK(t).tableFrom);

					tablesReferencingCurrent.push(...tablesRefs);
				}

				const uniqueTableRefs = [...new Set(tablesReferencingCurrent)];

				for (const table of uniqueTableRefs) {
					if (typeof tablesContext[table] === 'undefined') {
						tablesContext[table] = [..._moveDataStatements(table, json2)];
					}
				}
			} else {
				if (typeof tablesContext[newTableName] === 'undefined') {
					const stmnt = fromJson([statement], 'sqlite')[0];
					statementsToExecute.push(stmnt);
				}
			}
		} else if (statement.type === 'sqlite_alter_table_add_column') {
			const newTableName = getOldTableName(statement.tableName, meta);
			if (statement.column.notNull && !statement.column.default) {
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
			}
			if (statement.column.primaryKey) {
				tablesContext[newTableName] = [
					..._moveDataStatements(statement.tableName, json2, true),
				];
				const tablesReferencingCurrent: string[] = [];

				for (const table of Object.values(json1.tables)) {
					const tablesRefs = Object.values(json1.tables[table.name].foreignKeys)
						.filter(
							(t) => SQLiteSquasher.unsquashPushFK(t).tableTo === newTableName,
						)
						.map((t) => SQLiteSquasher.unsquashPushFK(t).tableFrom);

					tablesReferencingCurrent.push(...tablesRefs);
				}

				const uniqueTableRefs = [...new Set(tablesReferencingCurrent)];

				for (const table of uniqueTableRefs) {
					if (typeof tablesContext[table] === 'undefined') {
						tablesContext[table] = [..._moveDataStatements(table, json2)];
					}
				}
			} else {
				if (typeof tablesContext[newTableName] === 'undefined') {
					const stmnt = fromJson([statement], 'sqlite')[0];
					statementsToExecute.push(stmnt);
				}
			}
		} else if (
			statement.type === 'alter_table_alter_column_set_type'
			|| statement.type === 'alter_table_alter_column_set_default'
			|| statement.type === 'alter_table_alter_column_drop_default'
			|| statement.type === 'alter_table_alter_column_set_notnull'
			|| statement.type === 'alter_table_alter_column_drop_notnull'
			|| statement.type === 'alter_table_alter_column_drop_autoincrement'
			|| statement.type === 'alter_table_alter_column_set_autoincrement'
			|| statement.type === 'alter_table_alter_column_drop_pk'
			|| statement.type === 'alter_table_alter_column_set_pk'
		) {
			if (
				!(
					statement.type === 'alter_table_alter_column_set_notnull'
					&& statement.columnPk
				)
			) {
				const newTableName = getOldTableName(statement.tableName, meta);
				if (
					statement.type === 'alter_table_alter_column_set_notnull'
					&& typeof statement.columnDefault === 'undefined'
				) {
					const res = await connection.query<{ count: string }>(
						`select count(*) as count from \`${newTableName}\``,
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

						tablesToTruncate.push(newTableName);
						shouldAskForApprove = true;
					}
					tablesContext[newTableName] = _moveDataStatements(
						statement.tableName,
						json1,
						true,
					);
				} else {
					if (typeof tablesContext[newTableName] === 'undefined') {
						tablesContext[newTableName] = _moveDataStatements(
							statement.tableName,
							json1,
						);
					}
				}

				const tablesReferencingCurrent: string[] = [];

				for (const table of Object.values(json1.tables)) {
					const tablesRefs = Object.values(json1.tables[table.name].foreignKeys)
						.filter(
							(t) => SQLiteSquasher.unsquashPushFK(t).tableTo === newTableName,
						)
						.map((t) => {
							return getNewTableName(
								SQLiteSquasher.unsquashPushFK(t).tableFrom,
								meta,
							);
						});

					tablesReferencingCurrent.push(...tablesRefs);
				}

				const uniqueTableRefs = [...new Set(tablesReferencingCurrent)];

				for (const table of uniqueTableRefs) {
					if (typeof tablesContext[table] === 'undefined') {
						tablesContext[table] = [..._moveDataStatements(table, json1)];
					}
				}
			}
		} else if (
			statement.type === 'create_reference'
			|| statement.type === 'delete_reference'
			|| statement.type === 'alter_reference'
		) {
			const fk = SQLiteSquasher.unsquashPushFK(statement.data);

			if (typeof tablesContext[statement.tableName] === 'undefined') {
				tablesContext[statement.tableName] = _moveDataStatements(
					statement.tableName,
					json2,
				);
			}
		} else if (
			statement.type === 'create_composite_pk'
			|| statement.type === 'alter_composite_pk'
			|| statement.type === 'delete_composite_pk'
			|| statement.type === 'create_unique_constraint'
			|| statement.type === 'delete_unique_constraint'
		) {
			const newTableName = getOldTableName(statement.tableName, meta);
			if (typeof tablesContext[newTableName] === 'undefined') {
				tablesContext[newTableName] = _moveDataStatements(
					statement.tableName,
					json2,
				);
			}
		} else {
			const stmnt = fromJson([statement], 'sqlite');
			if (typeof stmnt !== 'undefined') {
				statementsToExecute.push(...stmnt);
			}
		}
	}

	for (const context of Object.values(tablesContext)) {
		statementsToExecute.push(...context);
	}

	return {
		statementsToExecute,
		shouldAskForApprove,
		infoToPrint,
		columnsToRemove: [...new Set(columnsToRemove)],
		schemasToRemove: [...new Set(schemasToRemove)],
		tablesToTruncate: [...new Set(tablesToTruncate)],
		tablesToRemove: [...new Set(tablesToRemove)],
	};
};
