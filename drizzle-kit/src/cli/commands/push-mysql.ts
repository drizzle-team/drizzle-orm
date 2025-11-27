import chalk from 'chalk';
import { render } from 'hanji';
import { extractMysqlExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { Column, Table, View } from '../../dialects/mysql/ddl';
import { interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff } from '../../dialects/mysql/diff';
import type { JsonStatement } from '../../dialects/mysql/statements';
import type { DB } from '../../utils';
import { prepareFilenames } from '../../utils/utils-node';
import { connectToMySQL } from '../connections';
import { highlightSQL } from '../highlighter';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import { explain, ProgressView } from '../views';
import { introspect } from './pull-mysql';

export const handle = async (
	schemaPath: string | string[],
	credentials: MysqlCredentials,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
	filters: EntitiesFilterConfig,
	explainFlag: boolean,
) => {
	const { prepareFromSchemaFiles, fromDrizzleSchema } = await import('../../dialects/mysql/drizzle');

	const filenames = prepareFilenames(schemaPath);
	console.log(chalk.gray(`Reading schema files:\n${filenames.join('\n')}\n`));
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractMysqlExisting(res.views);
	const filter = prepareEntityFilter('mysql', filters, existing);

	const { db, database } = await connectToMySQL(credentials);
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);

	const { schema: interimFromDB } = await introspect({ db, database, progress, filter });

	const interimFromFiles = fromDrizzleSchema(res.tables, res.views, casing);

	const { ddl: ddl1 } = interimToDDL(interimFromDB);
	const { ddl: ddl2 } = interimToDDL(interimFromFiles);
	// TODO: handle errors

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Table>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		'push',
	);

	const filteredStatements = statements;
	if (filteredStatements.length === 0) {
		render(`[${chalk.blue('i')}] No changes detected`);
	}

	const hints = await suggestions(db, filteredStatements);
	const explainMessage = explain('mysql', groupedStatements, explainFlag, hints);

	if (explainMessage) console.log(explainMessage);
	if (explainFlag) return;

	if (!force && hints.length > 0) {
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = hints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose) console.log(highlightSQL(statement));

		await db.query(statement);
	}

	if (filteredStatements.length > 0) {
		render(`[${chalk.green('✓')}] Changes applied`);
	} else {
		render(`[${chalk.blue('i')}] No changes detected`);
	}
};

// TODO: check
// export const filterStatements = (
// 	statements: JsonStatement[],
// 	currentSchema: TypeOf<typeof mysqlSchema>,
// 	prevSchema: TypeOf<typeof mysqlSchema>,
// ) => {
// 	return statements.filter((statement) => {
// 		if (statement.type === 'alter_table_alter_column_set_type') {
// 			// Don't need to handle it on migrations step and introspection
// 			// but for both it should be skipped
// 			if (
// 				statement.oldDataType.startsWith('tinyint')
// 				&& statement.newDataType.startsWith('boolean')
// 			) {
// 				return false;
// 			}

// 			if (
// 				statement.oldDataType.startsWith('bigint unsigned')
// 				&& statement.newDataType.startsWith('serial')
// 			) {
// 				return false;
// 			}

// 			if (
// 				statement.oldDataType.startsWith('serial')
// 				&& statement.newDataType.startsWith('bigint unsigned')
// 			) {
// 				return false;
// 			}
// 		} else if (statement.type === 'alter_table_alter_column_set_default') {
// 			if (
// 				statement.newDefaultValue === false
// 				&& statement.oldDefaultValue === 0
// 				&& statement.newDataType === 'boolean'
// 			) {
// 				return false;
// 			}
// 			if (
// 				statement.newDefaultValue === true
// 				&& statement.oldDefaultValue === 1
// 				&& statement.newDataType === 'boolean'
// 			) {
// 				return false;
// 			}
// 		} else if (statement.type === 'delete_unique_constraint') {
// 			const unsquashed = MySqlSquasher.unsquashUnique(statement.data);
// 			// only if constraint was removed from a serial column, than treat it as removed
// 			// const serialStatement = statements.find(
// 			//   (it) => it.type === "alter_table_alter_column_set_type"
// 			// ) as JsonAlterColumnTypeStatement;
// 			// if (
// 			//   serialStatement?.oldDataType.startsWith("bigint unsigned") &&
// 			//   serialStatement?.newDataType.startsWith("serial") &&
// 			//   serialStatement.columnName ===
// 			//     MySqlSquasher.unsquashUnique(statement.data).columns[0]
// 			// ) {
// 			//   return false;
// 			// }
// 			// Check if uniqueindex was only on this column, that is serial

// 			// if now serial and was not serial and was unique index
// 			if (
// 				unsquashed.columns.length === 1
// 				&& currentSchema.tables[statement.tableName].columns[unsquashed.columns[0]]
// 						.type === 'serial'
// 				&& prevSchema.tables[statement.tableName].columns[unsquashed.columns[0]]
// 						.type === 'serial'
// 				&& currentSchema.tables[statement.tableName].columns[unsquashed.columns[0]]
// 						.name === unsquashed.columns[0]
// 			) {
// 				return false;
// 			}
// 		} else if (statement.type === 'alter_table_alter_column_drop_notnull') {
// 			// only if constraint was removed from a serial column, than treat it as removed
// 			const serialStatement = statements.find(
// 				(it) => it.type === 'alter_table_alter_column_set_type',
// 			) as JsonAlterColumnTypeStatement;
// 			if (
// 				serialStatement?.oldDataType.startsWith('bigint unsigned')
// 				&& serialStatement?.newDataType.startsWith('serial')
// 				&& serialStatement.columnName === statement.columnName
// 				&& serialStatement.tableName === statement.tableName
// 			) {
// 				return false;
// 			}
// 			if (statement.newDataType === 'serial' && !statement.columnNotNull) {
// 				return false;
// 			}
// 			if (statement.columnAutoIncrement) {
// 				return false;
// 			}
// 		}

// 		return true;
// 	});
// };

export const suggestions = async (_db: DB, _statements: JsonStatement[]) => {
	return [] as { hint: string; statement?: string | undefined }[];

	// TODO: update and implement

	// Potential improvement:
	// ON UPDATE NOW() has an FSP (fractional seconds precision)
	// It cannot be added if it differs from the column TIMESTAMP FSP
	// Warn the user if it differs
	// Possibly add warn for generate command
	// @AlexSherman added this

	// for (const statement of statements) {
	// 	if (statement.type === 'drop_table') {
	// 		const res = await db.query(`select 1 from \`${statement.table}\` limit 1`);
	// 		if (res.length > 0) {
	// 			hints.push(`· You're about to delete non-empty ${chalk.underline(statement.table)} table`);
	// 		}
	// 	} else if (statement.type === 'drop_column') {
	// 		const res = await db.query(
	// 			`select 1 from \`${statement.column.table}\` limit 1`,
	// 		);
	// 		if (res.length > 0) {
	// 			hints.push(
	// 				`· You're about to delete ${
	// 					chalk.underline(
	// 						statement.column.name,
	// 					)
	// 				} column in a non-empty ${statement.column.table} table with`,
	// 			);
	// 		}
	// 	} else if (statement.type === 'alter_column') {
	// 		// alter column set type
	// 		// alter column set not null
	// 		`· You're about to set not-null constraint to ${
	// 			chalk.underline(statement.columnName)
	// 		} column without default, which contains ${count} items`;
	// 		`· You're about to remove default value from ${
	// 			chalk.underline(statement.columnName)
	// 		} not-null column with ${count} items`;

	// 		// if drop pk and json2 has autoincrement in table -> exit process with error
	// 		`${
	// 			withStyle.errorWarning(
	// 				`You have removed the primary key from a ${statement.tableName} table without removing the auto-increment property from this table. As the database error states: 'there can be only one auto column, and it must be defined as a key. Make sure to remove autoincrement from ${statement.tableName} table`,
	// 			)
	// 		}`;
	// 		`· You're about to change ${
	// 			chalk.underline(statement.tableName)
	// 		} primary key. This statements may fail and you table may left without primary key`;

	// 		// if drop pk and json2 has autoincrement in table -> exit process with error
	// 		`· You have removed the primary key from a ${statement.tableName} table without removing the auto-increment property from this table. As the database error states: 'there can be only one auto column, and it must be defined as a key. Make sure to remove autoincrement from ${statement.tableName} table`;
	// 		`· You're about to add not-null ${
	// 			chalk.underline(statement.column.name)
	// 		} column without default value, which contains ${count} items`;

	// 		const res = await db.query(
	// 			`select count(*) as count from \`${statement.tableName}\``,
	// 		);
	// 		const count = Number(res[0].count);
	// 		if (count > 0) {
	// 			`· You're about to change ${
	// 				chalk.underline(
	// 					statement.columnName,
	// 				)
	// 			} column type from ${
	// 				chalk.underline(
	// 					statement.oldDataType,
	// 				)
	// 			} to ${chalk.underline(statement.newDataType)} with ${count} items`;
	// 		}
	// 	} else if (statement.type === 'create_index' && statement.index.unique) {
	// 		const res = await db.query(
	// 			`select 1 from \`${statement.index.table}\` limit 1`,
	// 		);
	// 		const count = Number(res[0].count);
	// 		if (count > 0) {
	// 			console.log(
	// 				`· You're about to add ${
	// 					chalk.underline(
	// 						statement.index.name,
	// 					)
	// 				} unique constraint to the table, which contains ${count} items. If this statement fails, you will receive an error from the database. Do you want to truncate ${
	// 					chalk.underline(
	// 						statement.index.table,
	// 					)
	// 				} table?\n`,
	// 			);
	// 			const { status, data } = await render(
	// 				new Select([
	// 					'No, add the constraint without truncating the table',
	// 					`Yes, truncate the table`,
	// 				]),
	// 			);
	// 		}
	// 	}
	// }

	// return { hints, truncates };
};
