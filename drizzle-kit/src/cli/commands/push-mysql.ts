import chalk from 'chalk';
import { render } from 'hanji';
import { extractMysqlExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { Column, MysqlDDL, Table, View } from '../../dialects/mysql/ddl';
import { interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff } from '../../dialects/mysql/diff';
import type { JsonStatement } from '../../dialects/mysql/statements';
import type { DB } from '../../utils';
import { connectToMySQL } from '../connections';
import { isJsonMode } from '../context';
import { CommandOutputCliError, UnsupportedSchemaChangeError } from '../errors';
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
	mysqlSchemaError,
	printJsonOutput,
	ProgressView,
} from '../views';
import { introspect } from './pull-mysql';

export const handle = async (
	filenames: string[],
	credentials: MysqlCredentials,
	verbose: boolean,
	force: boolean,
	casing: CasingType | undefined,
	filters: EntitiesFilterConfig,
	explain: boolean,
	migrations: {
		table: string;
		schema: string;
	},
	hints: HintsHandler,
) => {
	const json = isJsonMode();

	const { prepareFromSchemaFiles, fromDrizzleSchema } = await import('../../dialects/mysql/drizzle');

	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractMysqlExisting(res.views);
	const filter = prepareEntityFilter('mysql', filters, existing);

	const { db, database } = await connectToMySQL(credentials);
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);

	const { schema: interimFromDB } = await introspect({ db, database, progress, filter, migrations });

	const interimFromFiles = fromDrizzleSchema(res.tables, res.views, casing);

	const { ddl: ddl1 } = interimToDDL(interimFromDB);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(interimFromFiles);
	// TODO: handle errors

	if (errors1.length > 0) {
		throw new CommandOutputCliError('push', errors1.map((it) => mysqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'mysql',
		});
	}

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Table>('table', 'public', 'push', hints),
		resolver<Column>('column', 'public', 'push', hints),
		resolver<View>('view', 'public', 'push', hints),
		'push',
	);

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (sqlStatements.length === 0) {
		if (json) {
			printJsonOutput({ status: 'no_changes', dialect: 'mysql' });
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
			printJsonOutput(explainJsonOutput('mysql', statements, suggestionHints));
		} else {
			const explainMessage = explainView('mysql', groupedStatements, suggestionHints);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}

	if (!force && !json && suggestionHints.length > 0) {
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
		printJsonOutput({ status: 'ok', dialect: 'mysql', message: 'Changes applied' });
	} else {
		render(`[${chalk.green('\u2713')}] Changes applied`);
	}
};

const identifier = ({ table, column }: { table?: string; column?: string }) => {
	return [table, column].filter(Boolean).map((t) => `\`${t}\``).join('.');
};
export const suggestions = async (db: DB, jsonStatements: JsonStatement[], ddl2: MysqlDDL, hints: HintsHandler) => {
	const json = isJsonMode();
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const entity: [string, string] = ['public', statement.table];
			if (hints.matchConfirm('table', entity)) continue;
			const res = await db.query(`select 1 from ${identifier({ table: statement.table })} limit 1`);

			if (res.length > 0) {
				if (json) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'table', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: `You're about to delete non-empty ${chalk.underline(statement.table)} table` });
				}
			}
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const entity: [string, string, string] = ['public', column.table, column.name];
			if (hints.matchConfirm('column', entity)) continue;
			const res = await db.query(`select 1 from ${identifier({ table: column.table })} limit 1`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'column', entity, reason: 'non_empty' });
			} else {
				grouped.push({
					hint: `You're about to delete non-empty ${chalk.underline(column.name)} column in ${
						chalk.underline(column.table)
					} table`,
				});
			}
			continue;
		}

		// drop pk
		if (statement.type === 'drop_pk') {
			const { table, columns } = statement.pk;
			const id = identifier({ table });
			const entity: [string, string, string] = ['public', table, statement.pk.name];
			if (hints.matchConfirm('primary_key', entity)) continue;
			const res = await db.query(
				`select 1 from ${id} limit 1`,
			);

			if (res.length > 0) {
				const hint = `You're about to drop ${
					chalk.underline(table)
				} primary key, this statements may fail and your table may lose primary key`;

				if (json) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'primary_key', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint });
				}
			}

			const fks = ddl2.fks.list({ tableTo: table });
			const indexes = ddl2.indexes.list({ isUnique: true, table: table });

			const fkFound = fks.filter((fk) => {
				if (fk.columnsTo.length !== columns.length) return false;

				return fk.columnsTo.every((fkCol) => columns.includes(fkCol));
			});

			if (fkFound.length === 0) continue;

			const indexesFound = indexes.some((index) => {
				if (index.columns.length !== columns.length) {
					return false;
				}

				return index.columns.every((col) => columns.includes(col.value));
			});

			if (indexesFound) continue;

			throw new UnsupportedSchemaChangeError({
				code: 'drop_pk_dependency',
				table,
				columns,
				blocking_fks: fkFound.map((fk) => fk.name),
			});
		}

		if (
			statement.type === 'add_column' && statement.column.notNull && statement.column.default === null
			&& !statement.column.generated
		) {
			const column = statement.column;
			const id = identifier({ table: column.table });
			const entity: [string, string, string] = ['public', column.table, column.name];
			if (hints.matchConfirm('add_not_null', entity)) continue;
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			const hint = `You're about to add not-null ${
				chalk.underline(statement.column.name)
			} column without default value to a non-empty ${chalk.underline(statement.column.table)} table`;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_not_null', entity, reason: 'nulls_present' });
			} else {
				grouped.push({ hint });
			}
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
				const entity: [string, string, string] = ['public', statement.column.table, statement.column.name];
				if (hints.matchConfirm('add_not_null', entity)) continue;
				const columnRes = await db.query(`select ${columnName} from ${tableName} WHERE ${columnName} IS NULL limit 1`);

				if (columnRes.length > 0) {
					const hint = `You're about to add not-null to a non-empty ${
						chalk.underline(columnName)
					} column without default value in ${chalk.underline(statement.column.table)} table`;

					if (json) {
						hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_not_null', entity, reason: 'nulls_present' });
					} else {
						grouped.push({ hint });
					}
				}
			}

			if (statement.diff.type) {
				const hint = `You're about to change ${
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
			const uniqueColumn = unique.columns[0];
			const entity: [string, string, string] = ['public', unique.table, uniqueColumn?.value ?? unique.name];
			if (hints.matchConfirm('add_unique', entity)) continue;

			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_unique', entity, reason: 'duplicates_present' });
			} else {
				grouped.push({
					hint: `You're about to add ${chalk.underline(unique.name)} unique index to a non-empty ${
						chalk.underline(unique.table)
					} table which may fail`,
				});
			}
			continue;
		}

		if (statement.type === 'create_fk' && statement.cause !== 'alter_pk') {
			const { columnsTo, table, tableTo, columns } = statement.fk;

			const indexes = ddl2.indexes.list({ isUnique: true, table: tableTo });
			const pk = ddl2.pks.one({ table: tableTo });

			const columnsToSet = new Set(columnsTo);

			const isUniqueFound = indexes.some((index) => {
				if (index.columns.length !== columnsToSet.size) {
					return false;
				}

				return index.columns.every((col) => columnsToSet.has(col.value));
			});

			const isPkFound = pk && pk.columns.length === columnsToSet.size
				&& pk.columns.every((col) => columnsToSet.has(col));

			if (isPkFound || isUniqueFound) continue;

			let composite = columnsTo.length > 1 ? 'composite ' : '';
			grouped.push({
				hint: `You are trying to add reference from "${table}" ("${columns.join('", ')}") to "${tableTo}" ("${
					columnsTo.join(
						'", ',
					)
				}"). The referenced columns are not guaranteed to be unique together. A foreign key must point to a PRIMARY KEY or a set of columns with a UNIQUE constraint. You should add a ${composite}unique constraint to the referenced columns`,
			});

			continue;
		}
	}

	return grouped;
};
