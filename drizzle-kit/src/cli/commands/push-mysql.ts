import chalk from 'chalk';
import { render } from 'hanji';
import { extractMysqlExisting } from '../../dialects/drizzle';
import type { Column, MysqlDDL, Table, View } from '../../dialects/mysql/ddl';
import { interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff } from '../../dialects/mysql/diff';
import type { JsonStatement } from '../../dialects/mysql/statements';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import type { DB } from '../../utils';
import { connectToMySQL } from '../connections';
import { isInteractive, outputFormat } from '../context';
import { CommandOutputCliError, UnsupportedSchemaChangeError } from '../errors';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import {
	EmptyProgressView,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	mysqlSchemaError,
	ProgressView,
} from '../views';
import { introspect } from './pull-mysql';

export const handle = async (
	filenames: string[],
	credentials: MysqlCredentials,
	verbose: boolean,
	force: boolean,
	filters: EntitiesFilterConfig,
	explain: boolean,
	migrations: {
		table: string;
		schema: string;
	},
	hints: HintsHandler,
) => {
	const json = outputFormat() === 'json';

	const { prepareFromSchemaFiles, fromDrizzleSchema } = await import('../../dialects/mysql/drizzle');

	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractMysqlExisting(res.views);
	const filter = prepareEntityFilter('mysql', filters, existing);

	const { db, database } = await connectToMySQL(credentials);
	const progress = json
		? new EmptyProgressView()
		: new ProgressView(
			'Pulling schema from database...',
			'Pulling schema from database...',
		);

	const { schema: interimFromDB } = await introspect({ db, database, progress, filter, migrations });

	const interimFromFiles = fromDrizzleSchema(res.tables, res.views);

	const { ddl: ddl1 } = interimToDDL(interimFromDB);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(interimFromFiles);

	if (errors1.length > 0) {
		throw new CommandOutputCliError('push', errors1.map((it) => mysqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'mysql',
		});
	}

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Table>('table', hints),
		resolver<Column>('column', hints),
		resolver<View>('view', hints),
		'push',
	);

	if (hints.hasMissingHints()) {
		return hints.toResponse();
	}

	if (sqlStatements.length === 0) {
		if (!json) {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
		return { status: 'no_changes' as const, dialect: 'mysql' };
	}

	const suggestionHints = await suggestions(db, statements, ddl2, hints);

	if (hints.hasMissingHints()) {
		return hints.toResponse();
	}

	if (explain) {
		if (json) {
			return explainJsonOutput('mysql', statements, suggestionHints);
		}
		const explainMessage = explainView('mysql', groupedStatements, suggestionHints);
		if (explainMessage) {
			humanLog(explainMessage);
		}
		return { status: 'ok' as const, dialect: 'mysql' };
	}

	if (!force && !json && isInteractive() && suggestionHints.length > 0) {
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = suggestionHints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose) humanLog(highlightSQL(statement));

		await db.query(statement);
	}

	if (!json) {
		render(`[${chalk.green('\u2713')}] Changes applied`);
	}
	return { status: 'ok' as const, dialect: 'mysql' };
};

const identifier = ({ table, column }: { table?: string; column?: string }) => {
	return [table, column].filter(Boolean).map((t) => `\`${t}\``).join('.');
};
export const suggestions = async (db: DB, jsonStatements: JsonStatement[], ddl2: MysqlDDL, hints: HintsHandler) => {
	const json = outputFormat() === 'json';
	const useHints = json || !isInteractive();
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const entity = ['public', statement.table] as const;
			if (hints.matchConfirm('table', entity)) continue;
			const res = await db.query(`select 1 from ${identifier({ table: statement.table })} limit 1`);

			if (res.length > 0) {
				if (useHints) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'table', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: `You're about to delete non-empty ${chalk.underline(statement.table)} table` });
				}
			}
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const entity = ['public', column.table, column.name] as const;
			if (hints.matchConfirm('column', entity)) continue;
			const res = await db.query(`select 1 from ${identifier({ table: column.table })} limit 1`);
			if (res.length === 0) continue;

			if (useHints) {
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
			const entity = ['public', table, statement.pk.name] as const;
			if (hints.matchConfirm('primary_key', entity)) continue;
			const res = await db.query(
				`select 1 from ${id} limit 1`,
			);

			if (res.length > 0) {
				const hint = `You're about to drop ${
					chalk.underline(table)
				} primary key, this statements may fail and your table may lose primary key`;

				if (useHints) {
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

			if (useHints) {
				throw new UnsupportedSchemaChangeError({
					kind: 'drop_pk_dependency',
					table,
					columns,
					blocking_fks: fkFound.map((fk) => fk.name),
				});
			}
			grouped.push({
				hint: `You are trying to drop primary key from "${table}" ("${
					columns.join('", ')
				}"), but there is an existing reference on this column. You must either add a UNIQUE constraint to ("${
					columns.join('", ')
				}") or drop the foreign key constraint that references this column.`,
			});
			continue;
		}

		if (statement.type === 'alter_column') {
			const tableName = identifier({ table: statement.origin.table });
			const columnName = identifier({ column: statement.origin.column });

			if (statement.diff.type) {
				const entity = ['public', statement.column.table, statement.column.name] as const;
				if (!hints.matchConfirm('column', entity)) {
					if (useHints) {
						hints.pushMissingHint({
							type: 'confirm_data_loss',
							kind: 'column',
							entity,
							reason: 'type_change',
							reason_details: { from: statement.diff.type.from, to: statement.diff.type.to },
						});
					} else {
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
				}
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

			throw new UnsupportedSchemaChangeError({
				kind: 'fk_target_not_unique',
				table,
				columns,
				table_to: tableTo,
				columns_to: columnsTo,
			});
		}
	}

	return grouped;
};
