import chalk from 'chalk';
import { render } from 'hanji';
import { Column, interimToDDL, Table } from 'src/dialects/sqlite/ddl';
import { diffDDL } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { JsonStatement } from 'src/dialects/sqlite/statements';
import { prepareFilenames } from '../../serializer';
import type { SQLiteDB } from '../../utils';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import { CasingType } from '../validations/common';
import { withStyle } from '../validations/outputs';
import type { SqliteCredentials } from '../validations/sqlite';
import { ProgressView } from '../views';

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
	const { sqliteIntrospect } = await import('./pull-sqlite');

	const db = await connectToSQLite(credentials);
	const files = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(files);
	const { ddl: ddl2, errors: e1 } = interimToDDL(fromDrizzleSchema(res.tables, res.views, casing));

	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);

	const { ddl: ddl1, errors: e2 } = await sqliteIntrospect(db, tablesFilter, progress);

	const { sqlStatements, statements, renames, warnings } = await diffDDL(
		ddl1,
		ddl2,
		resolver<Table>('table'),
		resolver<Column>('column'),
		'push',
	);

	if (sqlStatements.length === 0) {
		render(`\n[${chalk.blue('i')}] No changes detected`);
		return;
	}

	const { hints, statements: truncateStatements } = await suggestions(db, statements);

	if (verbose && sqlStatements.length > 0) {
		console.log();
		console.log(
			withStyle.warning('You are about to execute current statements:'),
		);
		console.log();
		console.log(sqlStatements.map((s) => chalk.blue(s)).join('\n'));
		console.log();
	}

	if (!force && strict) {
		const { status, data } = await render(
			new Select(['No, abort', `Yes, I want to execute all statements`]),
		);
		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	if (!force && hints.length > 0) {
		console.log(withStyle.warning('Found data-loss statements:'));
		console.log(hints.join('\n'));
		console.log();
		console.log(
			chalk.red.bold(
				'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
			),
		);

		console.log(chalk.white('Do you still want to push changes?'));

		const { status, data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	if (sqlStatements.length === 0) {
		render(`\n[${chalk.blue('i')}] No changes detected`);
	} else {
		if (!('driver' in credentials)) {
			await db.run('begin');
			try {
				for (const dStmnt of sqlStatements) {
					await db.run(dStmnt);
				}
				await db.run('commit');
			} catch (e) {
				console.error(e);
				await db.run('rollback');
				process.exit(1);
			}
		}
		render(`[${chalk.green('✓')}] Changes applied`);
	}
};

export const suggestions = async (
	connection: SQLiteDB,
	jsonStatements: JsonStatement[],
) => {
	const statements: string[] = [];
	const hints = [] as string[];

	// TODO: generate truncations/recreates ??
	for (const statement of jsonStatements) {
		if (statement.type === 'drop_table') {
			const name = statement.tableName;
			const res = await connection.query(`select 1 from "${name}" limit 1;`);

			if (res.length > 0) hints.push(`· You're about to delete non-empty '${name}' table`);
			continue;
		}

		if (statement.type === 'drop_column') {
			const { table, name } = statement.column;

			const res = await connection.query(`select 1 from "${name}" limit 1;`);
			if (res.length > 0) hints.push(`· You're about to delete '${name}' column in a non-empty '${table}' table`);
			continue;
		}

		if (statement.type === 'add_column' && (statement.column.notNull && !statement.column.default)) {
			const { table, name } = statement.column;
			const res = await connection.query(`select 1 from "${table}" limit 1`);
			if (res.length > 0) {
				hints.push(
					`· You're about to add not-null '${name}' column without default value to non-empty '${table}' table`,
				);
			}

			continue;
		}
	}

	return { statements, hints };
};
