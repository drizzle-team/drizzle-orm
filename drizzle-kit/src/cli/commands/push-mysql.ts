import chalk from 'chalk';
import { render } from 'hanji';
import { Column, interimToDDL, Table, View } from 'src/dialects/mysql/ddl';
import { prepareFilenames } from 'src/serializer';
import { TypeOf } from 'zod';
import { diffDDL } from '../../dialects/mysql/diff';
import { JsonStatement } from '../../jsonStatements';
import type { DB } from '../../utils';
import { Select } from '../selector-ui';
import type { CasingType } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import { withStyle } from '../validations/outputs';
import { ProgressView } from '../views';
import { resolver } from '../prompts';

export const handle = async (
	schemaPath: string | string[],
	credentials: MysqlCredentials,
	tablesFilter: string[],
	strict: boolean,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToMySQL } = await import('../connections');
	const { introspect } = await import('../../dialects/mysql/introspect');

	const { db, database } = await connectToMySQL(credentials);
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const interimFromDB = await introspect(db, database, tablesFilter, progress);

	const filenames = prepareFilenames(schemaPath);

	console.log(chalk.gray(`Reading schema files:\n${filenames.join('\n')}\n`));

	const { prepareFromSchemaFiles, fromDrizzleSchema } = await import('../../dialects/mysql/drizzle');

	const res = await prepareFromSchemaFiles(filenames);
	const interimFromFiles = fromDrizzleSchema(res.tables, res.views, casing);

	const { ddl: ddl1 } = interimToDDL(interimFromDB);
	const { ddl: ddl2 } = interimToDDL(interimFromFiles);
	// TODO: handle errors

	const { sqlStatements, statements } = await diffDDL(
		ddl1,
		ddl2,
		resolver<Table>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		'push',
	);

	const filteredStatements = filterStatements(
		statements ?? [],
		statements.validatedCur,
		statements.validatedPrev,
	);

	try {
		if (filteredStatements.length === 0) {
			render(`[${chalk.blue('i')}] No changes detected`);
		} else {
			const {
				shouldAskForApprove,
				statementsToExecute,
				columnsToRemove,
				tablesToRemove,
				tablesToTruncate,
				infoToPrint,
			} = await logSuggestionsAndReturn(
				db,
				filteredStatements,
				statements.validatedCur,
			);

			const { sqlStatements: filteredSqlStatements } = fromJson(filteredStatements, 'mysql');

			const uniqueSqlStatementsToExecute: string[] = [];
			statementsToExecute.forEach((ss) => {
				if (!uniqueSqlStatementsToExecute.includes(ss)) {
					uniqueSqlStatementsToExecute.push(ss);
				}
			});
			const uniqueFilteredSqlStatements: string[] = [];
			filteredSqlStatements.forEach((ss) => {
				if (!uniqueFilteredSqlStatements.includes(ss)) {
					uniqueFilteredSqlStatements.push(ss);
				}
			});

			if (verbose) {
				console.log();
				console.log(
					withStyle.warning('You are about to execute current statements:'),
				);
				console.log();
				console.log(
					[...uniqueSqlStatementsToExecute, ...uniqueFilteredSqlStatements]
						.map((s) => chalk.blue(s))
						.join('\n'),
				);
				console.log();
			}

			if (!force && strict) {
				if (!shouldAskForApprove) {
					const { status, data } = await render(
						new Select(['No, abort', `Yes, I want to execute all statements`]),
					);
					if (data?.index === 0) {
						render(`[${chalk.red('x')}] All changes were aborted`);
						process.exit(0);
					}
				}
			}

			if (!force && shouldAskForApprove) {
				console.log(withStyle.warning('Found data-loss statements:'));
				console.log(infoToPrint.join('\n'));
				console.log();
				console.log(
					chalk.red.bold(
						'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
					),
				);

				console.log(chalk.white('Do you still want to push changes?'));

				const { status, data } = await render(
					new Select([
						'No, abort',
						`Yes, I want to${
							tablesToRemove.length > 0
								? ` remove ${tablesToRemove.length} ${tablesToRemove.length > 1 ? 'tables' : 'table'},`
								: ' '
						}${
							columnsToRemove.length > 0
								? ` remove ${columnsToRemove.length} ${columnsToRemove.length > 1 ? 'columns' : 'column'},`
								: ' '
						}${
							tablesToTruncate.length > 0
								? ` truncate ${tablesToTruncate.length} ${tablesToTruncate.length > 1 ? 'tables' : 'table'}`
								: ''
						}`
							.replace(/(^,)|(,$)/g, '')
							.replace(/ +(?= )/g, ''),
					]),
				);
				if (data?.index === 0) {
					render(`[${chalk.red('x')}] All changes were aborted`);
					process.exit(0);
				}
			}

			for (const dStmnt of uniqueSqlStatementsToExecute) {
				await db.query(dStmnt);
			}

			for (const statement of uniqueFilteredSqlStatements) {
				await db.query(statement);
			}
			if (filteredStatements.length > 0) {
				render(`[${chalk.green('✓')}] Changes applied`);
			} else {
				render(`[${chalk.blue('i')}] No changes detected`);
			}
		}
	} catch (e) {
		console.log(e);
	}
};

export const filterStatements = (
	statements: JsonStatement[],
	currentSchema: TypeOf<typeof mysqlSchema>,
	prevSchema: TypeOf<typeof mysqlSchema>,
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
			const unsquashed = MySqlSquasher.unsquashUnique(statement.data);
			// only if constraint was removed from a serial column, than treat it as removed
			// const serialStatement = statements.find(
			//   (it) => it.type === "alter_table_alter_column_set_type"
			// ) as JsonAlterColumnTypeStatement;
			// if (
			//   serialStatement?.oldDataType.startsWith("bigint unsigned") &&
			//   serialStatement?.newDataType.startsWith("serial") &&
			//   serialStatement.columnName ===
			//     MySqlSquasher.unsquashUnique(statement.data).columns[0]
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

export const logSuggestionsAndReturn = async (
	db: DB,
	statements: JsonStatement[],
	json2: TypeOf<typeof mysqlSchema>,
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
				const unsquashedUnique = MySqlSquasher.unsquashUnique(statement.unique);
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
