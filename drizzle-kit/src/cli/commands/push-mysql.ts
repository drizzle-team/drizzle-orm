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

const identifier = ({ table, column }: { table?: string; column?: string }) => {
	return [table, column].filter(Boolean).map((t) => `\`${t}\``).join('.');
};
export const suggestions = async (db: DB, jsonStatements: JsonStatement[]) => {
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const res = await db.query(`select 1 from ${identifier({ table: statement.table })} limit 1`);

			if (res.length > 0) {
				grouped.push({ hint: `· You're about to delete non-empty ${chalk.underline(statement.table)} table` });
			}
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const res = await db.query(`select 1 from ${identifier({ table: column.table })} limit 1`);
			if (res.length === 0) continue;

			grouped.push({
				hint: `· You're about to delete non-empty ${chalk.underline(column.name)} column in ${
					chalk.underline(column.table)
				} table`,
			});
			continue;
		}

		// drop pk
		if (statement.type === 'drop_pk') {
			const table = statement.pk.table;
			const id = identifier({ table });
			const res = await db.query(
				`select 1 from ${id} limit 1`,
			);

			if (res.length === 0) continue;

			const hint = `· You're about to drop ${
				chalk.underline(table)
			} primary key, this statements may fail and your table may loose primary key`;

			grouped.push({ hint });
			continue;
		}

		if (
			statement.type === 'add_column' && statement.column.notNull && statement.column.default === null
			&& !statement.column.generated
		) {
			const column = statement.column;
			const id = identifier({ table: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			const hint = `· You're about to add not-null ${
				chalk.underline(statement.column.name)
			} column without default value to a non-empty ${chalk.underline(statement.column.table)} table`;

			grouped.push({ hint });
			continue;
		}

		if (statement.type === 'alter_column') {
			const tableName = identifier({ table: statement.origin.table });
			const columnName = identifier({ column: statement.origin.column });

			// add not null without default or generated
			if (
				statement.diff.notNull && statement.diff.notNull.to && statement.column.default === null
				&& !statement.column.generated
			) {
				const columnRes = await db.query(`select ${columnName} from ${tableName} WHERE ${columnName} IS NULL limit 1`);

				if (columnRes.length > 0) {
					const hint = `· You're about to add not-null to a non-empty ${
						chalk.underline(columnName)
					} column without default value in ${chalk.underline(statement.column.table)} table`;

					grouped.push({ hint });
				}
			}

			// Do not think that dropping default in not empty column could somehow break something
			// author: @AlexSherman

			// if (
			// 	statement.diff.default && statement.diff.default.to === null && statement.column.notNull
			// 	&& !statement.column.generated
			// ) {
			// 	const column = statement.column;
			// 	const tableName = identifier({ table: column.table });
			// 	const columnName = identifier({ column: column.name });
			// 	const res = await db.query(`select ${columnName} from ${tableName} WHERE ${columnName} IS NULL limit 1`);

			// 	if (res.length > 0) {
			// 		const hint =
			// 			`· You're about to drop default from ${columnName} column with not null in a non-empty ${tableName} table`;

			// 		grouped.push({ hint });
			// 	}
			// }

			if (statement.diff.type) {
				const hint = `· You're about to change ${
					chalk.underline(
						columnName,
					)
				} column type in ${tableName} from ${
					chalk.underline(
						statement.diff.type.from,
					)
				} to ${chalk.underline(statement.diff.type.to)}`;

				grouped.push({ hint });
			}

			continue;
		}

		if (statement.type === 'create_index') {
			if (!statement.index.isUnique) continue;

			const unique = statement.index;
			const id = identifier({ table: unique.table });

			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({
				hint: `· You're about to add ${chalk.underline(unique.name)} unique index to a non-empty ${
					chalk.underline(unique.table)
				} table which may fail`,
			});
			continue;
		}
	}

	return grouped;
};
