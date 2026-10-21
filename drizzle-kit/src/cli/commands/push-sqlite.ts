import chalk from 'chalk';
import { render } from 'hanji';
import { extractSqliteExisting } from '../../dialects/drizzle';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import type { Column, Table } from '../../dialects/sqlite/ddl';
import { interimToDDL } from '../../dialects/sqlite/ddl';
import { ddlDiff } from '../../dialects/sqlite/diff';
import { fromDrizzleSchema } from '../../dialects/sqlite/drizzle';
import type { SchemaSource } from '../../dialects/sqlite/drizzle';
import type { JsonStatement } from '../../dialects/sqlite/statements';
import type { SQLiteClient } from '../../utils';
import { isInteractive, outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import {
	EmptyProgressView,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	ProgressView,
	sqliteSchemaError,
} from '../views';
import { addNotNullColumnWarning, dropColumnWarning, dropTableWarning, tableNamesBeforeRenames } from './warnings';

export const handle = async (
	db: SQLiteClient,
	schemaSource: SchemaSource,
	verbose: boolean,
	credentials: SqliteCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	explain: boolean,
	migrations: {
		table: string;
		schema: string;
	},
	dialect: 'sqlite' | 'turso',
	hints: HintsHandler,
) => {
	const json = outputFormat() === 'json';

	const { introspect: sqliteIntrospect } = await import('./pull-sqlite');

	const res = await schemaSource.load();

	const existing = extractSqliteExisting(res.views);
	const filter = prepareEntityFilter('sqlite', filters, existing);

	const { schema: schemaTo, metadata } = fromDrizzleSchema(res.tables, res.views);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(schemaTo);

	if (errors1.length > 0) {
		throw new CommandOutputCliError('push', errors1.map((it) => sqliteSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect,
		});
	}

	const progress = json
		? new EmptyProgressView()
		: new ProgressView(
			'Pulling schema from database...',
			'Pulling schema from database...',
		);

	const { ddl: ddl1 } = await sqliteIntrospect(db, filter, progress, () => {}, migrations);

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Table>('table', hints),
		resolver<Column>('column', hints),
		'push',
		metadata,
	);

	if (hints.hasMissingHints()) {
		return hints.toResponse();
	}

	if (sqlStatements.length === 0) {
		if (!json) {
			render(`\n[${chalk.blue('i')}] No changes detected`);
		}
		return { status: 'no_changes' as const, dialect };
	}

	const suggestionHints = await suggestions(db, statements, hints);

	if (hints.hasMissingHints()) {
		return hints.toResponse();
	}

	if (explain) {
		if (json) {
			return explainJsonOutput(dialect, statements, suggestionHints);
		}
		const explainMessage = explainView('sqlite', groupedStatements, suggestionHints);
		if (explainMessage) {
			humanLog(explainMessage);
		}
		return { status: 'ok' as const, dialect };
	}

	if (!force && !json && isInteractive() && suggestionHints.length > 0) {
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = suggestionHints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	const allStatements = [...lossStatements, ...sqlStatements];

	if (verbose) humanLog(highlightSQL(allStatements.join('\n')));

	// no need to re-enable or re-disable PRAGMA foreign_keys, because this config lives per-connection
	// https://sqlite.org/pragma.html#pragma_foreign_keys
	// | Changing the foreign_keys setting affects the execution of all statements prepared using the database connection, including those prepared before the setting was changed.
	await db.batch(allStatements);

	if (!json) {
		render(`[${chalk.green('\u2713')}] Changes applied`);
	}
	return { status: 'ok' as const, dialect };
};

const quote = (name: string) => `"${name}"`;

export const suggestions = async (
	connection: SQLiteClient,
	jsonStatements: JsonStatement[],
	hints: HintsHandler,
) => {
	const json = outputFormat() === 'json';
	const useHints = json || !isInteractive();
	const grouped: { hint: string; statement?: string }[] = [];
	const { identifier, label } = tableNamesBeforeRenames(
		{ tables: jsonStatements.filter((it) => it.type === 'rename_table') },
		(it) => quote(it.name),
	);

	// TODO: generate truncations/recreates ??
	for (const statement of jsonStatements) {
		if (statement.type === 'drop_table') {
			const name = statement.tableName;
			const id = identifier({ name }, 'dropped');
			const entity = ['public', name] as const;
			if (hints.matchConfirm('table', entity)) continue;
			const res = await connection.query(`select 1 from ${id} limit 1;`);

			if (res.length > 0) {
				if (useHints) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'table', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: dropTableWarning(id) });
				}
			}
			continue;
		}

		if (statement.type === 'drop_column') {
			const { table, name } = statement.column;
			const entity = ['public', table, name] as const;
			if (hints.matchConfirm('column', entity)) continue;

			const res = await connection.query(
				`select 1 from ${identifier({ name: table }, 'kept')} where ${quote(name)} is not null limit 1;`,
			);
			if (res.length > 0) {
				if (useHints) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'column', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: dropColumnWarning(quote(name), label({ name: table })) });
				}
			}
			continue;
		}

		if (statement.type === 'add_column' && (statement.column.notNull && !statement.column.default)) {
			const { table, name } = statement.column;
			const entity = ['public', table, name] as const;
			const id = identifier({ name: table }, 'kept');
			const res = await connection.query(`select 1 from ${id} limit 1`);
			const tableNonEmpty = res.length > 0;
			const loss = {
				hint: addNotNullColumnWarning(quote(name), label({ name: table })),
				statement: `DELETE FROM ${id} where true;`,
			};

			if (hints.matchConfirm('add_not_null', entity)) {
				if (tableNonEmpty) {
					grouped.push(loss);
				}
				continue;
			}

			if (tableNonEmpty) {
				if (useHints) {
					hints.pushMissingHint({
						type: 'confirm_data_loss',
						kind: 'add_not_null',
						entity,
						reason: 'table_recreate',
					});
				} else {
					grouped.push(loss);
				}
			}

			continue;
		}

		if (statement.type === 'recreate_table') {
			const droppedColumns = statement.from.columns.filter((col) =>
				!statement.to.columns.some((c) => c.name === col.name)
			);
			if (droppedColumns.length === 0) continue;

			const table = { name: statement.from.name };
			for (const droppedColumn of droppedColumns) {
				const entity = ['public', table.name, droppedColumn.name] as const;
				if (hints.matchConfirm('column', entity)) continue;

				const res = await connection.query(
					`select 1 from ${identifier(table, 'kept')} where ${quote(droppedColumn.name)} is not null limit 1`,
				);
				if (res.length === 0) continue;

				if (useHints) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'column', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: dropColumnWarning(quote(droppedColumn.name), label(table)) });
				}
			}
		}
	}

	return grouped;
};
