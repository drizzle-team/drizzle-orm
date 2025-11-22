import chalk from 'chalk';
import { render } from 'hanji';
import { extractSqliteExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { Column, Table } from 'src/dialects/sqlite/ddl';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { ddlDiff } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import type { JsonStatement } from 'src/dialects/sqlite/statements';
import type { SQLiteDB } from '../../utils';
import { prepareFilenames } from '../../utils/utils-node';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import { withStyle } from '../validations/outputs';
import type { SqliteCredentials } from '../validations/sqlite';
import { ProgressView } from '../views';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: SqliteCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToSQLite } = await import('../connections');
	const { introspect: sqliteIntrospect } = await import('./pull-sqlite');

	const db = await connectToSQLite(credentials);
	const files = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(files);

	const existing = extractSqliteExisting(res.views);
	const filter = prepareEntityFilter('sqlite', filters, existing);

	const { ddl: ddl2 } = interimToDDL(fromDrizzleSchema(res.tables, res.views, casing));
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);

	const { ddl: ddl1 } = await sqliteIntrospect(db, filter, progress);

	const { sqlStatements, statements } = await ddlDiff(
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

	const { hints } = await suggestions(db, statements);

	if (verbose && sqlStatements.length > 0) {
		console.log();
		console.log(
			withStyle.warning('You are about to execute current statements:'),
		);
		console.log();
		console.log(sqlStatements.map((s) => chalk.blue(s)).join('\n'));
		console.log();
	}

	if (!force && sqlStatements.length > 0) {
		const { data } = await render(
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

		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	if (sqlStatements.length === 0) {
		render(`\n[${chalk.blue('i')}] No changes detected`);
	} else {
		if (!('driver' in credentials)) {
			// D1-HTTP does not support transactions
			// there might a be a better way to fix this
			// in the db connection itself
			const isD1 = 'driver' in credentials && credentials.driver === 'd1-http';
			if (!isD1) await db.run('begin');
			try {
				for (const dStmnt of sqlStatements) {
					await db.run(dStmnt);
				}
				if (!isD1) await db.run('commit');
			} catch (e) {
				console.error(e);

				if (!isD1) await db.run('rollback');
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

			const res = await connection.query(`select 1 from "${table}" limit 1;`);
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

				statements.push(`DELETE FROM "${table}" where true;`);
			}

			continue;
		}

		if (statement.type === 'recreate_table') {
			const droppedColumns = statement.from.columns.filter((col) =>
				!statement.to.columns.some((c) => c.name === col.name)
			);
			if (droppedColumns.length === 0) continue;

			const res = await connection.query(`select 1 from "${statement.from.name}" limit 1`);
			if (res.length > 0) {
				hints.push(
					`· You're about to drop ${
						droppedColumns.map((col) => `'${col.name}'`).join(', ')
					} column(s) in a non-empty '${statement.from.name}' table`,
				);
			}
		}
	}

	return { statements, hints };
};
