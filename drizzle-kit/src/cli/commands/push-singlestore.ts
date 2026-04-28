import chalk from 'chalk';
import { render, renderWithTask } from 'hanji';
import type { Column, Table, View } from 'src/dialects/mysql/ddl';
import { interimToDDL } from 'src/dialects/mysql/ddl';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { ddlDiff } from '../../dialects/singlestore/diff';
import { isJsonMode } from '../context';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import {
	abortedJsonOutput,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	printJsonOutput,
	ProgressView,
} from '../views';
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
	hints: HintsHandler,
) => {
	const json = isJsonMode();

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

	let sqlStatements: string[] = [];
	let statements = [] as Awaited<ReturnType<typeof ddlDiff>>['statements'];
	let groupedStatements = [] as Awaited<ReturnType<typeof ddlDiff>>['groupedStatements'];

	const diffResult = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Table>('table', 'public', 'push', hints),
		resolver<Column>('column', 'public', 'push', hints),
		resolver<View>('view', 'public', 'push', hints),
		'push',
	);

	sqlStatements = diffResult.sqlStatements;
	statements = diffResult.statements;
	groupedStatements = diffResult.groupedStatements;

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (sqlStatements.length === 0) {
		if (json) {
			printJsonOutput({ status: 'no_changes', dialect: 'singlestore' });
		} else {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
		return;
	}

	const suggestionHints = await suggestions(db, statements, ddl2, hints);

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (explain) {
		if (json) {
			printJsonOutput(explainJsonOutput('singlestore', statements, suggestionHints));
		} else {
			const explainMessage = explainView('singlestore', groupedStatements, suggestionHints);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}

	if (!force && suggestionHints.length > 0) {
		if (json) {
			printJsonOutput(abortedJsonOutput('singlestore', suggestionHints));
			process.exit(0);
		}
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));
		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = suggestionHints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose && !json) humanLog(highlightSQL(statement));

		await db.query(statement);
	}

	if (json) {
		printJsonOutput({ status: 'ok', dialect: 'singlestore', message: 'Changes applied' });
	} else {
		render(`[${chalk.green('\u2713')}] Changes applied`);
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
