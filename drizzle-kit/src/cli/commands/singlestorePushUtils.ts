import chalk from 'chalk';
import { render } from 'hanji';
import { fromJson } from 'src/sqlgenerator';
import { TypeOf } from 'zod';
import { JsonAlterColumnTypeStatement, JsonStatement } from '../../jsonStatements';
import { Column, SingleStoreSchemaSquashed, SingleStoreSquasher } from '../../serializer/singlestoreSchema';
import { singlestoreSchema } from '../../serializer/singlestoreSchema';
import { type DB, findAddedAndRemoved } from '../../utils';
import { Select } from '../selector-ui';
import { withStyle } from '../validations/outputs';

export const filterStatements = (
	statements: JsonStatement[],
	currentSchema: TypeOf<typeof singlestoreSchema>,
	prevSchema: TypeOf<typeof singlestoreSchema>,
) => {
	return statements.filter((statement) => {
		if (statement.type === 'alter_table_alter_column_set_type') {
			// Don't need to handle it on migrations step and introspection
			// but for both it should be skipped
			if (
				statement.oldDataType.startsWith('tinyint')
				&& statement.newDataType.startsWith('boolean')
			) {
				return false;
			}

			if (
				statement.oldDataType.startsWith('bigint unsigned')
				&& statement.newDataType.startsWith('serial')
			) {
				return false;
			}

			if (
				statement.oldDataType.startsWith('serial')
				&& statement.newDataType.startsWith('bigint unsigned')
			) {
				return false;
			}
		} else if (statement.type === 'alter_table_alter_column_set_default') {
			if (
				statement.newDefaultValue === false
				&& statement.oldDefaultValue === 0
				&& statement.newDataType === 'boolean'
			) {
				return false;
			}
			if (
				statement.newDefaultValue === true
				&& statement.oldDefaultValue === 1
				&& statement.newDataType === 'boolean'
			) {
				return false;
			}
		} else if (statement.type === 'delete_unique_constraint') {
			const unsquashed = SingleStoreSquasher.unsquashUnique(statement.data);
			// only if constraint was removed from a serial column, than treat it as removed
			// const serialStatement = statements.find(
			//   (it) => it.type === "alter_table_alter_column_set_type"
			// ) as JsonAlterColumnTypeStatement;
			// if (
			//   serialStatement?.oldDataType.startsWith("bigint unsigned") &&
			//   serialStatement?.newDataType.startsWith("serial") &&
			//   serialStatement.columnName ===
			//     SingleStoreSquasher.unsquashUnique(statement.data).columns[0]
			// ) {
			//   return false;
			// }
			// Check if uniqueindex was only on this column, that is serial

			// if now serial and was not serial and was unique index
			if (
				unsquashed.columns.length === 1
				&& currentSchema.tables[statement.tableName].columns[unsquashed.columns[0]]
						.type === 'serial'
				&& prevSchema.tables[statement.tableName].columns[unsquashed.columns[0]]
						.type === 'serial'
				&& currentSchema.tables[statement.tableName].columns[unsquashed.columns[0]]
						.name === unsquashed.columns[0]
			) {
				return false;
			}
		} else if (statement.type === 'alter_table_alter_column_drop_notnull') {
			// only if constraint was removed from a serial column, than treat it as removed
			const serialStatement = statements.find(
				(it) => it.type === 'alter_table_alter_column_set_type',
			) as JsonAlterColumnTypeStatement;
			if (
				serialStatement?.oldDataType.startsWith('bigint unsigned')
				&& serialStatement?.newDataType.startsWith('serial')
				&& serialStatement.columnName === statement.columnName
				&& serialStatement.tableName === statement.tableName
			) {
				return false;
			}
			if (statement.newDataType === 'serial' && !statement.columnNotNull) {
				return false;
			}
			if (statement.columnAutoIncrement) {
				return false;
			}
		}

		return true;
	});
};

export function findColumnTypeAlternations(
	columns1: Record<string, Column>,
	columns2: Record<string, Column>,
): string[] {
	const changes: string[] = [];

	for (const key in columns1) {
		if (columns1.hasOwnProperty(key) && columns2.hasOwnProperty(key)) {
			const col1 = columns1[key];
			const col2 = columns2[key];
			if (col1.type !== col2.type) {
				changes.push(col2.name);
			}
		}
	}

	return changes;
}

export const logSuggestionsAndReturn = async (
	db: DB,
	statements: JsonStatement[],
	json2: TypeOf<typeof singlestoreSchema>,
	json1: TypeOf<typeof singlestoreSchema>,
) => {
	let shouldAskForApprove = false;
	const statementsToExecute: string[] = [];
	const infoToPrint: string[] = [];

	const tablesToRemove: string[] = [];
	const columnsToRemove: string[] = [];
	const schemasToRemove: string[] = [];
	const tablesToTruncate: string[] = [];

	for (const statement of statements) {
		if (statement.type === 'drop_table') {
			const res = await db.query(
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
		} else if (statement.type === 'alter_table_drop_column') {
			const res = await db.query(
				`select count(*) as count from \`${statement.tableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(
							statement.columnName,
						)
					} column in ${statement.tableName} table with ${count} items`,
				);
				columnsToRemove.push(`${statement.tableName}_${statement.columnName}`);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'drop_schema') {
			const res = await db.query(
				`select count(*) as count from information_schema.tables where table_schema = \`${statement.name}\`;`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(
							statement.name,
						)
					} schema with ${count} tables`,
				);
				schemasToRemove.push(statement.name);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'alter_table_alter_column_set_type') {
			const res = await db.query(
				`select count(*) as count from \`${statement.tableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to change ${
						chalk.underline(
							statement.columnName,
						)
					} column type from ${
						chalk.underline(
							statement.oldDataType,
						)
					} to ${chalk.underline(statement.newDataType)} with ${count} items`,
				);
				statementsToExecute.push(`truncate table ${statement.tableName};`);
				tablesToTruncate.push(statement.tableName);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'alter_table_alter_column_drop_default') {
			if (statement.columnNotNull) {
				const res = await db.query(
					`select count(*) as count from \`${statement.tableName}\``,
				);

				const count = Number(res[0].count);
				if (count > 0) {
					infoToPrint.push(
						`· You're about to remove default value from ${
							chalk.underline(
								statement.columnName,
							)
						} not-null column with ${count} items`,
					);

					tablesToTruncate.push(statement.tableName);
					statementsToExecute.push(`truncate table ${statement.tableName};`);

					shouldAskForApprove = true;
				}
			}
			// shouldAskForApprove = true;
		} else if (statement.type === 'alter_table_alter_column_set_notnull') {
			if (typeof statement.columnDefault === 'undefined') {
				const res = await db.query(
					`select count(*) as count from \`${statement.tableName}\``,
				);

				const count = Number(res[0].count);
				if (count > 0) {
					infoToPrint.push(
						`· You're about to set not-null constraint to ${
							chalk.underline(
								statement.columnName,
							)
						} column without default, which contains ${count} items`,
					);

					tablesToTruncate.push(statement.tableName);
					statementsToExecute.push(`truncate table ${statement.tableName};`);

					shouldAskForApprove = true;
				}
			}
		} else if (statement.type === 'alter_table_alter_column_drop_pk') {
			const res = await db.query(
				`select count(*) as count from \`${statement.tableName}\``,
			);

			// if drop pk and json2 has autoincrement in table -> exit process with error
			if (
				Object.values(json2.tables[statement.tableName].columns).filter(
					(column) => column.autoincrement,
				).length > 0
			) {
				console.log(
					`${
						withStyle.errorWarning(
							`You have removed the primary key from a ${statement.tableName} table without removing the auto-increment property from this table. As the database error states: 'there can be only one auto column, and it must be defined as a key. Make sure to remove autoincrement from ${statement.tableName} table`,
						)
					}`,
				);
				process.exit(1);
			}

			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to change ${
						chalk.underline(
							statement.tableName,
						)
					} primary key. This statements may fail and you table may left without primary key`,
				);

				tablesToTruncate.push(statement.tableName);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'delete_composite_pk') {
			// if drop pk and json2 has autoincrement in table -> exit process with error
			if (
				Object.values(json2.tables[statement.tableName].columns).filter(
					(column) => column.autoincrement,
				).length > 0
			) {
				console.log(
					`${
						withStyle.errorWarning(
							`You have removed the primary key from a ${statement.tableName} table without removing the auto-increment property from this table. As the database error states: 'there can be only one auto column, and it must be defined as a key. Make sure to remove autoincrement from ${statement.tableName} table`,
						)
					}`,
				);
				process.exit(1);
			}
		} else if (statement.type === 'alter_table_add_column') {
			if (
				statement.column.notNull
				&& typeof statement.column.default === 'undefined'
			) {
				const res = await db.query(
					`select count(*) as count from \`${statement.tableName}\``,
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

					tablesToTruncate.push(statement.tableName);
					statementsToExecute.push(`truncate table ${statement.tableName};`);

					shouldAskForApprove = true;
				}
			}
		} else if (statement.type === 'create_unique_constraint') {
			const res = await db.query(
				`select count(*) as count from \`${statement.tableName}\``,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				const unsquashedUnique = SingleStoreSquasher.unsquashUnique(statement.data);
				console.log(
					`· You're about to add ${
						chalk.underline(
							unsquashedUnique.name,
						)
					} unique constraint to the table, which contains ${count} items. If this statement fails, you will receive an error from the database. Do you want to truncate ${
						chalk.underline(
							statement.tableName,
						)
					} table?\n`,
				);
				const { status, data } = await render(
					new Select([
						'No, add the constraint without truncating the table',
						`Yes, truncate the table`,
					]),
				);
				if (data?.index === 1) {
					tablesToTruncate.push(statement.tableName);
					statementsToExecute.push(`truncate table ${statement.tableName};`);
					shouldAskForApprove = true;
				}
			}
		} else if (statement.type === 'singlestore_recreate_table') {
			const tableName = statement.tableName;

			const prevColumns = json1.tables[tableName].columns;
			const currentColumns = json2.tables[tableName].columns;
			const { removedColumns, addedColumns } = findAddedAndRemoved(
				Object.keys(prevColumns),
				Object.keys(currentColumns),
			);

			if (removedColumns.length) {
				for (const removedColumn of removedColumns) {
					const res = await db.query<{ count: string }>(
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
					const [res] = await db.query<{ count: string }>(
						`select count(*) as count from \`${tableName}\``,
					);

					const columnConf = json2.tables[tableName].columns[addedColumn];

					const count = Number(res.count);
					if (count > 0 && columnConf.notNull && !columnConf.default) {
						infoToPrint.push(
							`· You're about to add not-null ${
								chalk.underline(
									addedColumn,
								)
							} column without default value to table, which contains ${count} items`,
						);
						shouldAskForApprove = true;
						tablesToTruncate.push(tableName);

						statementsToExecute.push(`TRUNCATE TABLE \`${tableName}\`;`);
					}
				}
			}

			const columnWithChangedType = findColumnTypeAlternations(prevColumns, currentColumns);
			for (const column of columnWithChangedType) {
				const [res] = await db.query<{ count: string }>(
					`select count(*) as count from \`${tableName}\` WHERE \`${tableName}\`.\`${column}\` IS NOT NULL;`,
				);

				const count = Number(res.count);
				if (count > 0) {
					infoToPrint.push(
						`· You're about recreate ${chalk.underline(tableName)} table with data type changing for ${
							chalk.underline(
								column,
							)
						} column, which contains ${count} items`,
					);
					shouldAskForApprove = true;
					tablesToTruncate.push(tableName);

					statementsToExecute.push(`TRUNCATE TABLE \`${tableName}\`;`);
				}
			}
		}

		const stmnt = fromJson([statement], 'singlestore', 'push');
		if (typeof stmnt !== 'undefined') {
			statementsToExecute.push(...stmnt);
		}
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
