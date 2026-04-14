import chalk from 'chalk';
import { render, renderWithTask } from 'hanji';
import type { Column, Table, View } from 'src/dialects/mysql/ddl';
import { interimToDDL } from 'src/dialects/mysql/ddl';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { ddlDiff } from '../../dialects/singlestore/diff';
import { CommandOutputCliError } from '../errors';
import { highlightSQL } from '../highlighter';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import { explain as explainView, explainJsonOutput, humanLog, printJsonOutput, ProgressView } from '../views';
import { suggestions } from './push-mysql';

export const handle = async (
	filenames: string[],
	credentials: MysqlCredentials,
	filters: EntitiesFilterConfig,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
	explain: boolean,
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const { connectToSingleStore } = await import('../connections');
	const { fromDatabaseForDrizzle } = await import('../../dialects/mysql/introspect');

	/*
		schemas in singlestore are ignored just like in mysql
		there're now views in singlestore either, so no entities with .existing() for now
	 */
	const filter = prepareEntityFilter('singlestore', filters, []);

	const { db, database } = await connectToSingleStore(credentials);
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const interimFromDB = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(db, database, filter, () => {}, migrations),
	);

	const { prepareFromSchemaFiles, fromDrizzleSchema } = await import('../../dialects/singlestore/drizzle');

	const res = await prepareFromSchemaFiles(filenames);
	const interimFromFiles = fromDrizzleSchema(res.tables, casing);

	const { ddl: ddl1 } = interimToDDL(interimFromDB);
	const { ddl: ddl2 } = interimToDDL(interimFromFiles);
	// TODO: handle errors

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Table>('table', 'public', 'push'),
		resolver<Column>('column', 'public', 'push'),
		resolver<View>('view', 'public', 'push'),
		'push',
	);

	const filteredStatements = statements;
	if (filteredStatements.length === 0) {
		if (isJsonMode()) {
			printJsonOutput({ status: 'ok', dialect: 'singlestore', message: 'No changes detected' });
			return;
		}
		render(`[${chalk.blue('i')}] No changes detected`);
	}

	const hints = await suggestions(db, filteredStatements, ddl2);
	if (explain) {
		if (isJsonMode()) {
			const explainOutput = explainJsonOutput('singlestore', statements, hints);
			printJsonOutput(explainOutput);
		} else {
			const explainMessage = explainView('singlestore', groupedStatements, hints);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}

	if (!force && hints.length > 0) {
		if (isJsonMode()) {
			throw new CommandOutputCliError(
				'push',
				'Destructive changes detected. Interactive confirmation is required but cannot be performed in JSON mode. Use --force to apply anyway.',
				{ dialect: 'singlestore', hints: hints.map((h) => h.hint) },
			);
		}
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = hints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose && !isJsonMode()) humanLog(highlightSQL(statement));

		await db.query(statement);
	}

	if (filteredStatements.length > 0) {
		if (isJsonMode()) {
			printJsonOutput({ status: 'ok', dialect: 'singlestore', message: 'Changes applied' });
		} else {
			render(`[${chalk.green('\u2713')}] Changes applied`);
		}
	} else if (!isJsonMode()) {
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
