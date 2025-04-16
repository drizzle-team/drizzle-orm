import chalk from 'chalk';
import { render } from 'hanji';
import { JsonStatement } from 'src/jsonStatements';
import { findAddedAndRemoved, SQLiteDB } from 'src/utils';
import { prepareSqlitePushSnapshot } from '../../migrationPreparator';
import { applyLibSQLSnapshotsDiff } from '../../snapshot-differ/libsql';
import {
	CreateSqliteIndexConvertor,
	fromJson,
	LibSQLModifyColumn,
	SQLiteCreateTableConvertor,
	SQLiteDropTableConvertor,
	SqliteRenameTableConvertor,
} from '../../sqlgenerator';
import { Select } from '../selector-ui';
import { CasingType } from '../validations/common';
import { LibSQLCredentials } from '../validations/libsql';
import { withStyle } from '../validations/outputs';

export const prepareLibSQLPush = async (
	schemaPath: string | string[],
	snapshot: SQLiteSchema,
	casing: CasingType | undefined,
) => {
	const { prev, cur } = await prepareSqlitePushSnapshot(snapshot, schemaPath, casing);

	const validatedPrev = sqliteSchema.parse(prev);
	const validatedCur = sqliteSchema.parse(cur);

	const squashedPrev = squashSqliteScheme(validatedPrev, SQLitePushSquasher);
	const squashedCur = squashSqliteScheme(validatedCur, SQLitePushSquasher);

	const { sqlStatements, statements, _meta } = await applyLibSQLSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	return {
		sqlStatements,
		statements,
		squashedPrev,
		squashedCur,
		meta: _meta,
	};
};

export const libSQLPush = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: LibSQLCredentials,
	tablesFilter: string[],
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToLibSQL } = await import('../connections');
	const { sqlitePushIntrospect } = await import('./pull-sqlite');

	const db = await connectToLibSQL(credentials);
	const { schema } = await sqlitePushIntrospect(db, tablesFilter);

	const statements = await prepareLibSQLPush(schemaPath, schema, casing);

	if (statements.sqlStatements.length === 0) {
		render(`\n[${chalk.blue('i')}] No changes detected`);
	} else {
		const {
			shouldAskForApprove,
			statementsToExecute,
			columnsToRemove,
			tablesToRemove,
			tablesToTruncate,
			infoToPrint,
		} = await libSqlLogSuggestionsAndReturn(
			db,
			statements.statements,
			statements.squashedPrev,
			statements.squashedCur,
			statements.meta!,
		);

		if (verbose && statementsToExecute.length > 0) {
			console.log();
			console.log(
				withStyle.warning('You are about to execute current statements:'),
			);
			console.log();
			console.log(statementsToExecute.map((s) => chalk.blue(s)).join('\n'));
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
						.trimEnd()
						.replace(/(^,)|(,$)/g, '')
						.replace(/ +(?= )/g, ''),
				]),
			);
			if (data?.index === 0) {
				render(`[${chalk.red('x')}] All changes were aborted`);
				process.exit(0);
			}
		}

		if (statementsToExecute.length === 0) {
			render(`\n[${chalk.blue('i')}] No changes detected`);
		} else {
			await db.batchWithPragma!(statementsToExecute);
			render(`[${chalk.green('✓')}] Changes applied`);
		}
	}
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

export const _moveDataStatements = (
	tableName: string,
	json: SQLiteSchemaSquashed,
	dataLoss: boolean = false,
) => {
	const statements: string[] = [];

	const newTableName = `__new_${tableName}`;

	// create table statement from a new json2 with proper name
	const tableColumns = Object.values(json.tables[tableName].columns);
	const referenceData = Object.values(json.tables[tableName].foreignKeys);
	const compositePKs = Object.values(
		json.tables[tableName].compositePrimaryKeys,
	).map((it) => SQLiteSquasher.unsquashPK(it));
	const checkConstraints = Object.values(json.tables[tableName].checkConstraints);

	const fks = referenceData.map((it) => SQLiteSquasher.unsquashPushFK(it));

	const mappedCheckConstraints: string[] = checkConstraints.map((it) =>
		it.replaceAll(`"${tableName}".`, `"${newTableName}".`)
			.replaceAll(`\`${tableName}\`.`, `\`${newTableName}\`.`)
			.replaceAll(`${tableName}.`, `${newTableName}.`)
			.replaceAll(`'${tableName}'.`, `\`${newTableName}\`.`)
	);

	// create new table
	statements.push(
		new SQLiteCreateTableConvertor().convert({
			type: 'sqlite_create_table',
			tableName: newTableName,
			columns: tableColumns,
			referenceData: fks,
			compositePKs,
			checkConstraints: mappedCheckConstraints,
		}),
	);

	// move data
	if (!dataLoss) {
		const columns = Object.keys(json.tables[tableName].columns).map(
			(c) => `"${c}"`,
		);

		statements.push(
			`INSERT INTO \`${newTableName}\`(${
				columns.join(
					', ',
				)
			}) SELECT ${columns.join(', ')} FROM \`${tableName}\`;`,
		);
	}

	statements.push(
		new SQLiteDropTableConvertor().convert({
			type: 'drop_table',
			tableName: tableName,
			schema: '',
		}),
	);

	// rename table
	statements.push(
		new SqliteRenameTableConvertor().convert({
			fromSchema: '',
			tableNameFrom: newTableName,
			tableNameTo: tableName,
			toSchema: '',
			type: 'rename_table',
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

			if (!tablesReferencingCurrent.length) {
				statementsToExecute.push(..._moveDataStatements(tableName, json2, dataLoss));
				continue;
			}

			// recreate table
			statementsToExecute.push(
				..._moveDataStatements(tableName, json2, dataLoss),
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
