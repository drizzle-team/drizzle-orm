import chalk from 'chalk';
import { render } from 'hanji';
import { TypeOf } from 'zod';
import { JsonAlterColumnTypeStatement, JsonStatement } from '../../jsonStatements';
import { prepareSingleStoreDbPushSnapshot } from '../../migrationPreparator';
import {
	SingleStoreSchema,
	singlestoreSchema,
	SingleStoreSquasher,
	squashSingleStoreScheme,
} from '../../serializer/singlestoreSchema';
import { applySingleStoreSnapshotsDiff } from '../../snapshot-differ/singlestore';
import { fromJson } from '../../sqlgenerator';
import type { DB } from '../../utils';
import { Select } from '../selector-ui';
import { CasingType } from '../validations/common';
import { withStyle } from '../validations/outputs';
import { SingleStoreCredentials } from '../validations/singlestore';


// Not needed for now
function singleStoreSchemaSuggestions(
	curSchema: TypeOf<typeof singlestoreSchema>,
	prevSchema: TypeOf<typeof singlestoreSchema>,
) {
	const suggestions: string[] = [];
	const usedSuggestions: string[] = [];
	const suggestionTypes = {
		// TODO: Check if SingleStore has serial type
		serial: withStyle.errorWarning(
			`We deprecated the use of 'serial' for SingleStore starting from version 0.20.0. In SingleStore, 'serial' is simply an alias for 'bigint unsigned not null auto_increment unique,' which creates all constraints and indexes for you. This may make the process less explicit for both users and drizzle-kit push commands`,
		),
	};

	for (const table of Object.values(curSchema.tables)) {
		for (const column of Object.values(table.columns)) {
			if (column.type === 'serial') {
				if (!usedSuggestions.includes('serial')) {
					suggestions.push(suggestionTypes['serial']);
				}

				const uniqueForSerial = Object.values(
					prevSchema.tables[table.name].uniqueConstraints,
				).find((it) => it.columns[0] === column.name);

				suggestions.push(
					`\n`
						+ withStyle.suggestion(
							`We are suggesting to change ${
								chalk.blue(
									column.name,
								)
							} column in ${
								chalk.blueBright(
									table.name,
								)
							} table from serial to bigint unsigned\n\n${
								chalk.blueBright(
									`bigint("${column.name}", { mode: "number", unsigned: true }).notNull().autoincrement().unique(${
										uniqueForSerial?.name ? `"${uniqueForSerial?.name}"` : ''
									})`,
								)
							}`,
						),
				);
			}
		}
	}

	return suggestions;
}

// Intersect with prepareAnMigrate
export const prepareSingleStorePush = async (
	schemaPath: string | string[],
	snapshot: SingleStoreSchema,
	casing: CasingType | undefined,
) => {
	try {
		const { prev, cur } = await prepareSingleStoreDbPushSnapshot(
			snapshot,
			schemaPath,
			casing,
		);

		const validatedPrev = singlestoreSchema.parse(prev);
		const validatedCur = singlestoreSchema.parse(cur);

		const squashedPrev = squashSingleStoreScheme(validatedPrev);
		const squashedCur = squashSingleStoreScheme(validatedCur);

		const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			validatedPrev,
			validatedCur,
			'push',
		);

		return { sqlStatements, statements, validatedCur, validatedPrev };
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
};

export const singlestorePush = async (
	schemaPath: string | string[],
	credentials: SingleStoreCredentials,
	tablesFilter: string[],
	strict: boolean,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToSingleStore } = await import('../connections');
	const { singlestorePushIntrospect } = await import('./pull-singlestore');

	const { db, database } = await connectToSingleStore(credentials);

	const { schema } = await singlestorePushIntrospect(
		db,
		database,
		tablesFilter,
	);
	const { prepareSingleStorePush } = await import('./generate-common');

	const statements = await prepareSingleStorePush(schemaPath, schema, casing);

	const filteredStatements = singleStoreFilterStatements(
		statements.statements ?? [],
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
				schemasToRemove,
			} = await singleStoreLogSuggestionsAndReturn(
				db,
				filteredStatements,
				statements.validatedCur,
			);

			const { sqlStatements: filteredSqlStatements } = fromJson(filteredStatements, 'singlestore');

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

export const logSuggestionsAndReturn = async (
	db: DB,
	statements: JsonStatement[],
	json2: TypeOf<typeof singlestoreSchema>,
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
				const unsquashedUnique = SingleStoreSquasher.unsquashUnique(statement.unique);
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
