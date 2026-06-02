import chalk from 'chalk';
import { render } from 'hanji';
import { extractSqliteExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { Column, Table } from 'src/dialects/sqlite/ddl';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { ddlDiff } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import type { JsonStatement } from 'src/dialects/sqlite/statements';
import type { SQLiteClient } from '../../utils';
import { highlightSQL } from '../highlighter';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import { explain, ProgressView, sqliteSchemaError } from '../views';

export const handle = async (
	db: SQLiteClient,
	filenames: string[],
	verbose: boolean,
	credentials: SqliteCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	explainFlag: boolean,
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const { introspect: sqliteIntrospect } = await import('./pull-sqlite');

	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractSqliteExisting(res.views);
	const filter = prepareEntityFilter('sqlite', filters, existing);

	const { ddl: ddl2, errors: errors1 } = interimToDDL(fromDrizzleSchema(res.tables, res.views));

	if (errors1.length > 0) {
		console.log(errors1.map((it) => sqliteSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);

	const { ddl: ddl1 } = await sqliteIntrospect(db, filter, progress, () => {}, migrations);

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
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

	const hints = await suggestions(db, statements);

	const explainMessage = explain('sqlite', groupedStatements, explainFlag, hints);

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

	const allStatements = [...lossStatements, ...sqlStatements];

	if (verbose) console.log(highlightSQL(allStatements.join('\n')));

	// no need to re-enable or re-disable PRAGMA foreign_keys, because this config lives per-connection
	// https://sqlite.org/pragma.html#pragma_foreign_keys
	// | Changing the foreign_keys setting affects the execution of all statements prepared using the database connection, including those prepared before the setting was changed.
	await db.batch(allStatements);

	render(`[${chalk.green('✓')}] Changes applied`);
};

export const suggestions = async (
	connection: SQLiteClient,
	jsonStatements: JsonStatement[],
) => {
	const grouped: { hint: string; statement?: string }[] = [];

	// TODO: generate truncations/recreates ??
	for (const statement of jsonStatements) {
		if (statement.type === 'drop_table') {
			const name = statement.tableName;
			const res = await connection.query(`select 1 from "${name}" limit 1;`);

			if (res.length > 0) grouped.push({ hint: `· You're about to delete non-empty '${name}' table` });
			continue;
		}

		if (statement.type === 'drop_column') {
			const { table, name } = statement.column;

			const res = await connection.query(`select 1 from "${table}" limit 1;`);
			if (res.length > 0) {
				grouped.push({ hint: `· You're about to delete '${name}' column in a non-empty '${table}' table` });
			}
			continue;
		}

		if (statement.type === 'add_column' && (statement.column.notNull && !statement.column.default)) {
			const { table, name } = statement.column;
			const res = await connection.query(`select 1 from "${table}" limit 1`);
			if (res.length > 0) {
				grouped.push(
					{
						hint: `· You're about to add not-null '${name}' column without default value to non-empty '${table}' table`,
						statement: `DELETE FROM "${table}" where true;`,
					},
				);
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
				grouped.push(
					{
						hint: `· You're about to drop ${
							droppedColumns.map((col) => `'${col.name}'`).join(', ')
						} column(s) in a non-empty '${statement.from.name}' table`,
					},
				);
			}
		}
	}

	return grouped;
};
