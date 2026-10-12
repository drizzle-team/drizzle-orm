import chalk from 'chalk';
import { randomUUID } from 'crypto';
import { render } from 'hanji';
import { Minimatch } from 'minimatch';
import { serializePg } from 'src/serializer';
import { originUUID } from '../../global';
import { fromJson } from '../../sqlgenerator';
import { Select } from '../selector-ui';
import { Entities } from '../validations/cli';
import type { ClickHouseCredentials } from '../validations/clickhouse';
import { CasingType } from '../validations/common';
import { LibSQLCredentials } from '../validations/libsql';
import type { MysqlCredentials } from '../validations/mysql';
import { withStyle } from '../validations/outputs';
import type { PostgresCredentials } from '../validations/postgres';
import { SingleStoreCredentials } from '../validations/singlestore';
import type { SqliteCredentials } from '../validations/sqlite';
import { libSqlLogSuggestionsAndReturn } from './libSqlPushUtils';
import {
	filterStatements as mySqlFilterStatements,
	logSuggestionsAndReturn as mySqlLogSuggestionsAndReturn,
} from './mysqlPushUtils';
import { pgSuggestions } from './pgPushUtils';
import {
	filterStatements as singleStoreFilterStatements,
	logSuggestionsAndReturn as singleStoreLogSuggestionsAndReturn,
} from './singlestorePushUtils';
import { logSuggestionsAndReturn as sqliteSuggestions } from './sqlitePushUtils';

export const mysqlPush = async (
	schemaPath: string | string[],
	credentials: MysqlCredentials,
	tablesFilter: string[],
	strict: boolean,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToMySQL } = await import('../connections');
	const { mysqlPushIntrospect } = await import('./mysqlIntrospect');

	const { db, database } = await connectToMySQL(credentials);

	const { schema } = await mysqlPushIntrospect(db, database, tablesFilter);
	const { prepareMySQLPush } = await import('./migrate');

	const statements = await prepareMySQLPush(schemaPath, schema, casing);

	const filteredStatements = mySqlFilterStatements(
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
			} = await mySqlLogSuggestionsAndReturn(
				db,
				filteredStatements,
				statements.validatedCur,
			);

			const filteredSqlStatements = fromJson(filteredStatements, 'mysql');

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
	const { singlestorePushIntrospect } = await import('./singlestoreIntrospect');

	const { db, database } = await connectToSingleStore(credentials);

	const { schema } = await singlestorePushIntrospect(
		db,
		database,
		tablesFilter,
	);
	const { prepareSingleStorePush } = await import('./migrate');

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
				statements.validatedPrev,
			);

			if (verbose) {
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
							.replace(/(^,)|(,$)/g, '')
							.replace(/ +(?= )/g, ''),
					]),
				);
				if (data?.index === 0) {
					render(`[${chalk.red('x')}] All changes were aborted`);
					process.exit(0);
				}
			}

			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
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

/**
 * Applies a schema to a live ClickHouse database.
 *
 * ClickHouse has no transactions, so the statements are applied one at a time and a failure part-way
 * leaves the earlier ones in place. Statements that drop data or rebuild a table are surfaced for
 * confirmation first.
 */
export const clickhousePush = async (
	schemaPath: string | string[],
	credentials: ClickHouseCredentials,
	tablesFilter: string[],
	strict: boolean,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToClickHouse } = await import('../connections');
	const { fromDatabase } = await import('../../serializer/clickhouseSerializer');
	const { clickhouseSchema } = await import('../../serializer/clickhouseSchema');
	const { isDestructive } = await import('../../clickhouseStatements');

	const { db, database } = await connectToClickHouse(credentials);

	const matchers = tablesFilter.map((it) => new Minimatch(it));
	const filter = (tableName: string) => matchers.length === 0 || matchers.every((matcher) => matcher.match(tableName));

	const introspected = await fromDatabase(db, database, filter);
	const schema = clickhouseSchema.parse({
		id: originUUID,
		prevId: '',
		...introspected,
	});

	const { prepareClickHousePush } = await import('./migrate');
	const statements = await prepareClickHousePush(schemaPath, schema, casing);

	try {
		if (statements.sqlStatements.length === 0) {
			render(`[${chalk.blue('i')}] No changes detected`);
			return;
		}

		if (verbose) {
			console.log();
			console.log(withStyle.warning('You are about to execute current statements:'));
			console.log();
			console.log(statements.sqlStatements.map((s) => chalk.blue(s)).join('\n'));
			console.log();
		}

		const destructive = statements.statements.filter((it) => isDestructive(it));

		if (!force && strict && destructive.length === 0) {
			const { data } = await render(
				new Select(['No, abort', `Yes, I want to execute all statements`]),
			);
			if (data?.index === 0) {
				render(`[${chalk.red('x')}] All changes were aborted`);
				process.exit(0);
			}
		}

		if (!force && destructive.length > 0) {
			console.log(withStyle.warning('Found data-loss statements:'));
			for (const statement of destructive) {
				if (statement.type === 'ch_drop_table') {
					console.log(`· You're about to delete ${chalk.underline(statement.tableName)} table`);
				} else if (statement.type === 'ch_drop_column') {
					console.log(
						`· You're about to delete ${chalk.underline(statement.columnName)} column in ${
							chalk.underline(statement.tableName)
						} table`,
					);
				} else if (statement.type === 'ch_recreate_table') {
					console.log(
						`· ${
							chalk.underline(statement.table.name)
						} has to be recreated (${statement.reason}), which drops its data`,
					);
				}
			}
			console.log();
			console.log(chalk.red.bold('THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n'));
			console.log(chalk.white('Do you still want to push changes?'));

			const { data } = await render(
				new Select(['No, abort', `Yes, I want to execute all statements`]),
			);
			if (data?.index === 0) {
				render(`[${chalk.red('x')}] All changes were aborted`);
				process.exit(0);
			}
		}

		for (const statement of statements.sqlStatements) {
			await db.query(statement);
		}

		render(`[${chalk.green('✓')}] Changes applied`);
	} catch (e) {
		console.log(e);
	}
};

export const pgPush = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: PostgresCredentials,
	tablesFilter: string[],
	schemasFilter: string[],
	entities: Entities,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { preparePostgresDB } = await import('../connections');
	const { pgPushIntrospect } = await import('./pgIntrospect');

	const db = await preparePostgresDB(credentials);
	const serialized = await serializePg(schemaPath, casing, schemasFilter);

	const { schema } = await pgPushIntrospect(db, tablesFilter, schemasFilter, entities, serialized);

	const { preparePgPush } = await import('./migrate');

	const statements = await preparePgPush(
		{ id: randomUUID(), prevId: schema.id, ...serialized },
		schema,
	);

	try {
		if (statements.sqlStatements.length === 0) {
			render(`[${chalk.blue('i')}] No changes detected`);
		} else {
			// const filteredStatements = filterStatements(statements.statements);
			const {
				shouldAskForApprove,
				statementsToExecute,
				columnsToRemove,
				tablesToRemove,
				matViewsToRemove,
				tablesToTruncate,
				infoToPrint,
				schemasToRemove,
			} = await pgSuggestions(db, statements.statements);

			if (verbose) {
				console.log();
				// console.log(chalk.gray('Verbose logs:'));
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
						}${
							matViewsToRemove.length > 0
								? ` remove ${matViewsToRemove.length} ${
									matViewsToRemove.length > 1 ? 'materialized views' : 'materialize view'
								},`
								: ' '
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

			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}

			if (statements.statements.length > 0) {
				render(`[${chalk.green('✓')}] Changes applied`);
			} else {
				render(`[${chalk.blue('i')}] No changes detected`);
			}
		}
	} catch (e) {
		console.error(e);
	}
};

export const sqlitePush = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: SqliteCredentials,
	tablesFilter: string[],
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToSQLite } = await import('../connections');
	const { sqlitePushIntrospect } = await import('./sqliteIntrospect');

	const db = await connectToSQLite(credentials);
	const { schema } = await sqlitePushIntrospect(db, tablesFilter);
	const { prepareSQLitePush } = await import('./migrate');

	const statements = await prepareSQLitePush(schemaPath, schema, casing);

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
			schemasToRemove,
		} = await sqliteSuggestions(
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
			// D1-HTTP does not support transactions
			// there might a be a better way to fix this
			// in the db connection itself
			const isNotD1 = !('driver' in credentials && credentials.driver === 'd1-http');
			isNotD1 ?? await db.run('begin');
			try {
				for (const dStmnt of statementsToExecute) {
					await db.run(dStmnt);
				}
				isNotD1 ?? await db.run('commit');
			} catch (e) {
				console.error(e);
				isNotD1 ?? await db.run('rollback');
				process.exit(1);
			}
			render(`[${chalk.green('✓')}] Changes applied`);
		}
	}
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
	const { sqlitePushIntrospect } = await import('./sqliteIntrospect');

	const db = await connectToLibSQL(credentials);
	const { schema } = await sqlitePushIntrospect(db, tablesFilter);

	const { prepareLibSQLPush } = await import('./migrate');

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
