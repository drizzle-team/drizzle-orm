import chalk from 'chalk';
import { render } from 'hanji';
import { extractMssqlExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type {
	CheckConstraint,
	Column,
	DefaultConstraint,
	ForeignKey,
	Index,
	MssqlDDL,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from '../../dialects/mssql/ddl';
import { interimToDDL } from '../../dialects/mssql/ddl';
import { ddlDiff } from '../../dialects/mssql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/mssql/drizzle';
import type { JsonStatement } from '../../dialects/mssql/statements';
import type { DB } from '../../utils';
import { isJsonMode } from '../context';
import { CommandOutputCliError } from '../errors';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { MssqlCredentials } from '../validations/mssql';
import {
	abortedJsonOutput,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	mssqlSchemaError,
	printJsonOutput,
	ProgressView,
} from '../views';

export const handle = async (
	filenames: string[],
	verbose: boolean,
	credentials: MssqlCredentials,
	filters: EntitiesFilterConfig,
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

	const { connectToMsSQL } = await import('../connections');
	const { introspect } = await import('./pull-mssql');

	const { db } = await connectToMsSQL(credentials);
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractMssqlExisting(res.schemas, res.views);
	const filter = prepareEntityFilter('mssql', filters, existing);

	const { schema: schemaTo, errors } = fromDrizzleSchema(res, casing, filter);

	if (errors.length > 0) {
		throw new CommandOutputCliError('push', errors.map((it) => mssqlSchemaError(it)).join('\n'), {
			dialect: 'mssql',
		});
	}

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: schemaFrom } = await introspect(db, filter, progress, migrations);

	const { ddl: ddl1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(schemaTo);

	if (errors1.length > 0) {
		throw new CommandOutputCliError('push', errors1.map((it) => mssqlSchemaError(it)).join('\n'), {
			dialect: 'mssql',
		});
	}

	const { sqlStatements, statements: jsonStatements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema', 'dbo', 'push', hints),
		resolver<MssqlEntities['tables']>('table', 'dbo', 'push', hints),
		resolver<Column>('column', 'dbo', 'push', hints),
		resolver<View>('view', 'dbo', 'push', hints),
		resolver<UniqueConstraint>('unique', 'dbo', 'push', hints),
		resolver<Index>('index', 'dbo', 'push', hints),
		resolver<CheckConstraint>('check', 'dbo', 'push', hints),
		resolver<PrimaryKey>('primary key', 'dbo', 'push', hints),
		resolver<ForeignKey>('foreign key', 'dbo', 'push', hints),
		resolver<DefaultConstraint>('default', 'dbo', 'push', hints),
		'push',
	);

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (sqlStatements.length === 0) {
		if (json) {
			printJsonOutput({ status: 'no_changes', dialect: 'mssql' });
		} else {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
		return;
	}

	const suggestionHints = await suggestions(db, jsonStatements, ddl2, hints);

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (explain) {
		if (json) {
			printJsonOutput(explainJsonOutput('mssql', jsonStatements, suggestionHints));
		} else {
			const explainMessage = explainView('mssql', groupedStatements, suggestionHints);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}

	if (!force && suggestionHints.length > 0) {
		if (json) {
			printJsonOutput(abortedJsonOutput('mssql', suggestionHints));
			process.exit(0);
		}
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));
		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			return;
		}
	}

	const lossStatements = suggestionHints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose && !json) humanLog(highlightSQL(statement));

		await db.query(statement);
	}

	if (json) {
		printJsonOutput({ status: 'ok', dialect: 'mssql', message: 'Changes applied' });
	} else {
		render(`[${chalk.green('\u2713')}] Changes applied`);
	}
};

const identifier = (it: { schema?: string; table: string }) => {
	const { schema, table } = it;

	const schemaKey = schema && schema !== 'dbo' ? `[${schema}].` : '';
	const tableKey = `[${table}]`;

	return `${schemaKey}${tableKey}`;
};

export const suggestions = async (db: DB, jsonStatements: JsonStatement[], ddl2: MssqlDDL, hints: HintsHandler) => {
	const json = isJsonMode();
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const tableName = identifier({ schema: statement.table.schema, table: statement.table.name });
			const entity: [string, string] = [statement.table.schema ?? 'dbo', statement.table.name];
			if (hints.matchConfirm('table', entity)) continue;
			const res = await db.query(`select top(1) 1 from ${tableName};`);

			if (res.length > 0) {
				if (json) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'table', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: `You're about to delete non-empty [${statement.table.name}] table` });
				}
			}
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;

			const key = identifier({ schema: column.schema, table: column.table });
			const entity: [string, string, string] = [column.schema ?? 'dbo', column.table, column.name];
			if (hints.matchConfirm('column', entity)) continue;

			const res = await db.query(`SELECT TOP(1) 1 FROM ${key} WHERE [${column.name}] IS NOT NULL;`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'column', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete non-empty [${column.name}] column in [${column.table}] table` });
			}
			continue;
		}

		if (statement.type === 'drop_schema') {
			const entity: [string] = [statement.name];
			if (hints.matchConfirm('schema', entity)) continue;
			// count tables in schema
			const res = await db.query(
				`select count(*) as count from information_schema.tables where table_schema = '${statement.name}';`,
			);
			const count = Number(res[0].count);
			if (count === 0) continue;

			const tableGrammar = count === 1 ? 'table' : 'tables';
			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'schema', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete [${statement.name}] schema with ${count} ${tableGrammar}` });
			}
			continue;
		}

		// add not null without default
		if (
			statement.type === 'alter_column' && statement.diff.$right.notNull
			&& !ddl2.defaults.one({
				column: statement.diff.$right.name,
				schema: statement.diff.$right.schema,
				table: statement.diff.$right.table,
			})
		) {
			const column = statement.diff.$right;
			const key = identifier({ schema: column.schema, table: column.table });
			const entity: [string, string, string] = [column.schema ?? 'dbo', column.table, column.name];
			if (hints.matchConfirm('add_not_null', entity)) continue;
			const res = await db.query(`select top(1) 1 from ${key};`);

			if (res.length === 0) continue;
			const hint =
				`You're about to add not-null to [${statement.diff.$right.name}] column without default value to a non-empty ${key} table`;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_not_null', entity, reason: 'nulls_present' });
			} else {
				grouped.push({ hint });
			}

			continue;
		}

		if (
			statement.type === 'add_column' && statement.column.notNull
			&& !ddl2.defaults.one({
				column: statement.column.name,
				schema: statement.column.schema,
				table: statement.column.table,
			})
		) {
			const column = statement.column;
			const key = identifier({ schema: column.schema, table: column.table });
			const entity: [string, string, string] = [column.schema ?? 'dbo', column.table, column.name];
			if (hints.matchConfirm('add_not_null', entity)) continue;
			const res = await db.query(`select top(1) 1 from ${key};`);

			if (res.length === 0) continue;
			const hint =
				`You're about to add not-null [${statement.column.name}] column without default value to a non-empty ${key} table`;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_not_null', entity, reason: 'nulls_present' });
			} else {
				grouped.push({ hint });
			}

			continue;
		}

		if (statement.type === 'drop_pk') {
			const schema = statement.pk.schema ?? 'dbo';
			const table = statement.pk.table;
			const id = identifier({ table: table, schema: schema });
			const entity: [string, string, string] = [schema, table, statement.pk.name];
			if (hints.matchConfirm('primary_key', entity)) continue;
			const res = await db.query(
				`select top(1) 1 from ${id};`,
			);

			if (res.length > 0) {
				const hint = `You're about to drop ${
					chalk.underline(id)
				} primary key, this statements may fail and your table may loose primary key`;

				if (json) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'primary_key', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint });
				}
			}

			continue;
		}

		if (statement.type === 'add_unique') {
			const unique = statement.unique;
			const id = identifier({ schema: unique.schema, table: unique.table });
			const entity: [string, string, string] = [unique.schema ?? 'dbo', unique.table, unique.columns[0] ?? unique.name];
			if (hints.matchConfirm('add_unique', entity)) continue;

			const res = await db.query(`select top(1) 1 from ${id};`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_unique', entity, reason: 'duplicates_present' });
			} else {
				grouped.push({
					hint: `You're about to add ${
						chalk.underline(unique.name)
					} unique constraint to a non-empty ${id} table which may fail`,
				});
			}

			continue;
		}

		// TODO should we abort process here?
		if (
			statement.type === 'rename_column'
			&& ddl2.checks.one({ schema: statement.to.schema, table: statement.to.table })
		) {
			const left = statement.from;
			const right = statement.to;

			grouped.push({
				hint:
					`You are trying to rename column from ${left.name} to ${right.name}, but it is not possible to rename a column if it is used in a check constraint on the table.
To rename the column, first drop the check constraint, then rename the column, and finally recreate the check constraint`,
			});

			continue;
		}

		if (statement.type === 'rename_schema') {
			const left = statement.from;
			const right = statement.to;

			grouped.push({
				hint:
					`You are trying to rename schema ${left.name} to ${right.name}, but it is not supported to rename a schema in mssql.
You should create new schema and transfer everything to it`,
			});

			continue;
		}
	}

	return grouped;
};
