import chalk from 'chalk';
import { render } from 'hanji';
import type { JsonStatement } from '../../jsonStatements';
import { PgSquasher } from '../../serializer/pgSchema';
import { fromJson } from '../../sqlgenerator';
import type { DB } from '../../utils';
import { Select } from '../selector-ui';

// export const filterStatements = (statements: JsonStatement[]) => {
//   return statements.filter((statement) => {
//     if (statement.type === "alter_table_alter_column_set_type") {
//       // Don't need to handle it on migrations step and introspection
//       // but for both it should be skipped
//       if (
//         statement.oldDataType.startsWith("tinyint") &&
//         statement.newDataType.startsWith("boolean")
//       ) {
//         return false;
//       }
//     } else if (statement.type === "alter_table_alter_column_set_default") {
//       if (
//         statement.newDefaultValue === false &&
//         statement.oldDefaultValue === 0 &&
//         statement.newDataType === "boolean"
//       ) {
//         return false;
//       }
//       if (
//         statement.newDefaultValue === true &&
//         statement.oldDefaultValue === 1 &&
//         statement.newDataType === "boolean"
//       ) {
//         return false;
//       }
//     }
//     return true;
//   });
// };

function concatSchemaAndTableName(schema: string | undefined, table: string) {
	return schema ? `"${schema}"."${table}"` : `"${table}"`;
}

function tableNameWithSchemaFrom(
	schema: string | undefined,
	tableName: string,
	renamedSchemas: Record<string, string>,
	renamedTables: Record<string, string>,
) {
	const newSchemaName = schema ? (renamedSchemas[schema] ? renamedSchemas[schema] : schema) : undefined;

	const newTableName = renamedTables[concatSchemaAndTableName(newSchemaName, tableName)]
		? renamedTables[concatSchemaAndTableName(newSchemaName, tableName)]
		: tableName;

	return concatSchemaAndTableName(newSchemaName, newTableName);
}

export const pgSuggestions = async (db: DB, statements: JsonStatement[]) => {
	let shouldAskForApprove = false;
	const statementsToExecute: string[] = [];
	const infoToPrint: string[] = [];

	const tablesToRemove: string[] = [];
	const columnsToRemove: string[] = [];
	const schemasToRemove: string[] = [];
	const tablesToTruncate: string[] = [];
	const matViewsToRemove: string[] = [];

	let renamedSchemas: Record<string, string> = {};
	let renamedTables: Record<string, string> = {};

	for (const statement of statements) {
		if (statement.type === 'rename_schema') {
			renamedSchemas[statement.to] = statement.from;
		} else if (statement.type === 'rename_table') {
			renamedTables[concatSchemaAndTableName(statement.toSchema, statement.tableNameTo)] = statement.tableNameFrom;
		} else if (statement.type === 'drop_table') {
			const res = await db.query(
				`select count(*) as count from ${
					tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
				}`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(`· You're about to delete ${chalk.underline(statement.tableName)} table with ${count} items`);
				// statementsToExecute.push(
				//   `truncate table ${tableNameWithSchemaFrom(statement)} cascade;`
				// );
				tablesToRemove.push(statement.tableName);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'drop_view' && statement.materialized) {
			const res = await db.query(`select count(*) as count from "${statement.schema ?? 'public'}"."${statement.name}"`);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete "${chalk.underline(statement.name)}" materialized view with ${count} items`,
				);

				matViewsToRemove.push(statement.name);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'alter_table_drop_column') {
			const res = await db.query(
				`select count(*) as count from ${
					tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
				}`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to delete ${
						chalk.underline(statement.columnName)
					} column in ${statement.tableName} table with ${count} items`,
				);
				columnsToRemove.push(`${statement.tableName}_${statement.columnName}`);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'drop_schema') {
			const res = await db.query(
				`select count(*) as count from information_schema.tables where table_schema = '${statement.name}';`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(`· You're about to delete ${chalk.underline(statement.name)} schema with ${count} tables`);
				schemasToRemove.push(statement.name);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'alter_table_alter_column_set_type') {
			const res = await db.query(
				`select count(*) as count from ${
					tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
				}`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to change ${chalk.underline(statement.columnName)} column type from ${
						chalk.underline(statement.oldDataType)
					} to ${
						chalk.underline(
							statement.newDataType,
						)
					} with ${count} items`,
				);
				statementsToExecute.push(
					`truncate table ${
						tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
					} cascade;`,
				);
				tablesToTruncate.push(statement.tableName);
				shouldAskForApprove = true;
			}
		} else if (statement.type === 'alter_table_alter_column_drop_pk') {
			const res = await db.query(
				`select count(*) as count from ${
					tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
				}`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				infoToPrint.push(
					`· You're about to change ${
						chalk.underline(statement.tableName)
					} primary key. This statements may fail and you table may left without primary key`,
				);

				tablesToTruncate.push(statement.tableName);
				shouldAskForApprove = true;
			}

			const tableNameWithSchema = tableNameWithSchemaFrom(
				statement.schema,
				statement.tableName,
				renamedSchemas,
				renamedTables,
			);

			const pkNameResponse = await db.query(
				`SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = '${
					typeof statement.schema === 'undefined' || statement.schema === '' ? 'public' : statement.schema
				}'
            AND table_name = '${statement.tableName}'
            AND constraint_type = 'PRIMARY KEY';`,
			);

			statementsToExecute.push(
				`ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${pkNameResponse[0].constraint_name}"`,
			);
			// we will generate statement for drop pk here and not after all if-else statements
			continue;
		} else if (statement.type === 'alter_table_add_column') {
			if (statement.column.notNull && typeof statement.column.default === 'undefined') {
				const res = await db.query(
					`select count(*) as count from ${
						tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
					}`,
				);
				const count = Number(res[0].count);
				if (count > 0) {
					infoToPrint.push(
						`· You're about to add not-null ${
							chalk.underline(statement.column.name)
						} column without default value, which contains ${count} items`,
					);

					tablesToTruncate.push(statement.tableName);
					statementsToExecute.push(
						`truncate table ${
							tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
						} cascade;`,
					);

					shouldAskForApprove = true;
				}
			}
		} else if (statement.type === 'create_unique_constraint') {
			const res = await db.query(
				`select count(*) as count from ${
					tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
				}`,
			);
			const count = Number(res[0].count);
			if (count > 0) {
				const unsquashedUnique = PgSquasher.unsquashUnique(statement.data);
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
					new Select(['No, add the constraint without truncating the table', `Yes, truncate the table`]),
				);
				if (data?.index === 1) {
					tablesToTruncate.push(statement.tableName);
					statementsToExecute.push(
						`truncate table ${
							tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
						} cascade;`,
					);
					shouldAskForApprove = true;
				}
			}
		}
		const stmnt = fromJson([statement], 'postgresql', 'push');
		if (typeof stmnt !== 'undefined') {
			statementsToExecute.push(...stmnt);
		}
	}

	return {
		statementsToExecute: [...new Set(statementsToExecute)],
		shouldAskForApprove,
		infoToPrint,
		matViewsToRemove: [...new Set(matViewsToRemove)],
		columnsToRemove: [...new Set(columnsToRemove)],
		schemasToRemove: [...new Set(schemasToRemove)],
		tablesToTruncate: [...new Set(tablesToTruncate)],
		tablesToRemove: [...new Set(tablesToRemove)],
	};
};
