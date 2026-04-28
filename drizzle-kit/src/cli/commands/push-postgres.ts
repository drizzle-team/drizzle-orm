import chalk from 'chalk';
import { render } from 'hanji';
import { extractPostgresExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { interimToDDL } from '../../dialects/postgres/ddl';
import { ddlDiff } from '../../dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/postgres/drizzle';
import type { JsonStatement } from '../../dialects/postgres/statements';
import type { DB } from '../../utils';
import { isJsonMode } from '../context';
import { CommandOutputCliError } from '../errors';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { PostgresCredentials } from '../validations/postgres';
import {
	abortedJsonOutput,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	postgresSchemaError,
	postgresSchemaWarning,
	printJsonOutput,
	ProgressView,
} from '../views';

export const handle = async (
	filenames: string[],
	verbose: boolean,
	credentials: PostgresCredentials,
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
	const { preparePostgresDB } = await import('../connections');
	const { introspect } = await import('./pull-postgres');

	const db = await preparePostgresDB(credentials);
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractPostgresExisting(res.schemas, res.views, res.matViews);
	const entityFilter = prepareEntityFilter('postgresql', filters, existing);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(res, casing, entityFilter);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		throw new CommandOutputCliError('push', errors.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'postgresql',
		});
	}

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');

	const { schema: schemaFrom } = await introspect(
		db,
		entityFilter,
		progress,
		() => {},
		migrations,
	);

	const { ddl: ddl1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(schemaTo);
	// TODO: handle errors?

	if (errors1.length > 0) {
		throw new CommandOutputCliError('push', errors1.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'postgresql',
		});
	}

	// const blanks = new Set<string>();
	const { sqlStatements, statements: jsonStatements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema', 'public', 'push', hints),
		resolver<Enum>('enum', 'public', 'push', hints),
		resolver<Sequence>('sequence', 'public', 'push', hints),
		resolver<Policy>('policy', 'public', 'push', hints),
		resolver<Role>('role', 'public', 'push', hints),
		resolver<Privilege>('privilege', 'public', 'push', hints),
		resolver<PostgresEntities['tables']>('table', 'public', 'push', hints),
		resolver<Column>('column', 'public', 'push', hints),
		resolver<View>('view', 'public', 'push', hints),
		resolver<UniqueConstraint>('unique', 'public', 'push', hints),
		resolver<Index>('index', 'public', 'push', hints),
		resolver<CheckConstraint>('check', 'public', 'push', hints),
		resolver<PrimaryKey>('primary key', 'public', 'push', hints),
		resolver<ForeignKey>('foreign key', 'public', 'push', hints),
		'push',
	);

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (sqlStatements.length === 0) {
		if (json) {
			printJsonOutput({ status: 'no_changes', dialect: 'postgres' });
		} else {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
		return;
	}

	const dataLossHints = await suggestions(db, jsonStatements, hints);

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (explain) {
		if (json) {
			const explainOutput = explainJsonOutput('postgres', jsonStatements, dataLossHints);
			printJsonOutput(explainOutput);
		} else {
			const explainMessage = explainView('postgres', groupedStatements, dataLossHints);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}

	if (!force && dataLossHints.length > 0) {
		if (json) {
			printJsonOutput(abortedJsonOutput('postgres', dataLossHints));
			process.exit(0);
		}
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = dataLossHints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose && !json) humanLog(highlightSQL(statement));

		await db.query(statement);
	}

	if (json) {
		printJsonOutput({ status: 'ok', dialect: 'postgres', message: 'Changes applied' });
	} else {
		render(`[${chalk.green('\u2713')}] Changes applied`);
	}
};

const identifier = (it: { schema?: string; name: string }) => {
	const { schema, name } = it;
	const schemakey = schema && schema !== 'public' ? `"${schema}".` : '';
	return `${schemakey}"${name}"`;
};

export const suggestions = async (db: DB, jsonStatements: JsonStatement[], hints: HintsHandler) => {
	const json = isJsonMode();
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		// TODO: discussion -
		if (it.type === 'drop_view' && it.cause) return false;

		/*
			drizzle-kit push does not handle alternations of postgres views definitions
			just like with check constraints we can only reliably handle this with introduction of shadow db

			for now we encourage developers to `remove view from drizzle schema -> push -> add view to drizzle schema -> push`
		 */
		if (it.type === 'alter_column' && it.diff.generated) return false;

		/*
      [Update] it does now, we have origin of creation

      drizzle-kit push does not handle alternation of check constraints
      that's a limitation due to a nature of in-database way of persisting check constraints values

      in order to properly support one - we'd need to either fully implement in-database DDL,
      or implement proper commutativity checks or use shadow DB for push command(the most reasonable way)
		*/
		// if (it.type === 'alter_column') return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const entity = [statement.table.schema, statement.table.name] as const;
			if (hints.matchConfirm('table', entity)) continue;
			const res = await db.query(`select 1 from ${statement.key} limit 1`);

			if (res.length > 0) {
				if (json) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'table', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: `You're about to delete non-empty ${statement.key} table` });
				}
			}
			continue;
		}

		if (statement.type === 'drop_view' && statement.view.materialized) {
			const id = identifier(statement.view);
			const entity = [statement.view.schema, statement.view.name] as const;
			if (hints.matchConfirm('view', entity)) continue;
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'view', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete non-empty ${id} materialized view` });
			}
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const entity: [string, string, string] = [column.schema, column.table, column.name];
			if (hints.matchConfirm('column', entity)) continue;
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'column', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete non-empty ${column.name} column in ${id} table` });
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

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'schema', entity, reason: 'non_empty' });
			} else {
				grouped.push({
					hint: `You're about to delete ${chalk.underline(statement.name)} schema with ${count} tables`,
				});
			}
			continue;
		}

		// drop pk
		if (statement.type === 'drop_pk') {
			const schema = statement.pk.schema ?? 'public';
			const table = statement.pk.table;
			const id = `"${schema}"."${table}"`;
			const entity: [string, string, string] = [schema, table, statement.pk.name];
			if (hints.matchConfirm('primary_key', entity)) continue;
			const res = await db.query(
				`select 1 from ${id} limit 1`,
			);

			if (res.length === 0) continue;

			const hint = `You're about to drop ${
				chalk.underline(id)
			} primary key, this statements may fail and your table may loose primary key`;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'primary_key', entity, reason: 'non_empty' });
				continue;
			}

			if (statement.pk.nameExplicit) {
				grouped.push({ hint });
				continue;
			}

			const [{ name: pkName }] = await db.query<{ name: string }>(`
        SELECT constraint_name as name 
        FROM information_schema.table_constraints
        WHERE 
          table_schema = '${schema}'
          AND table_name = '${table}'
          AND constraint_type = 'PRIMARY KEY';`);

			grouped.push({ hint, statement: `ALTER TABLE ${id} DROP CONSTRAINT "${pkName}"` });
			continue;
		}

		// todo: alter column to not null no default
		if (
			statement.type === 'add_column' && statement.column.notNull && statement.column.default === null
			&& !statement.column.generated && !statement.column.identity
		) {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const entity: [string, string, string] = [column.schema, column.table, column.name];
			if (hints.matchConfirm('add_not_null', entity)) continue;
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			const hint = `You're about to add not-null ${
				chalk.underline(statement.column.name)
			} column without default value to a non-empty ${id} table`;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_not_null', entity, reason: 'nulls_present' });
			} else {
				grouped.push({ hint });
			}
			// statementsToExecute.push(`truncate table ${id} cascade;`);
			continue;
		}

		if (statement.type === 'add_unique') {
			const unique = statement.unique;
			const id = identifier({ schema: unique.schema, name: unique.table });
			const uniqueColumn = unique.columns[0];
			if (!uniqueColumn) continue;
			const entity: [string, string, string] = [unique.schema, unique.table, uniqueColumn];
			if (hints.matchConfirm('add_unique', entity)) continue;

			const res = await db.query(`select 1 from ${id} limit 1`);
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
			// const { status, data } = await render(
			// 	new Select(['No, add the constraint without truncating the table', `Yes, truncate the table`]),
			// );
			// if (data?.index === 1) {
			// 	statementsToExecute.push(
			// 		`truncate table ${
			// 			tableNameWithSchemaFrom(statement.schema, statement.tableName, renamedSchemas, renamedTables)
			// 		} cascade;`,
			// 	);
			// }
			continue;
		}
	}

	return grouped;
};
