/**
 * DSQL Push Command
 *
 * Pushes schema changes to a DSQL database cluster.
 *
 * DSQL-specific behavior:
 * - No transaction support (each DDL statement auto-commits)
 * - Uses CREATE INDEX ASYNC instead of CONCURRENTLY
 * - Simplified suggestions (no enums, policies)
 */

import chalk from 'chalk';
import { getViewConfig } from 'drizzle-orm/dsql-core';
import type { DSQLSchema, DSQLView } from 'drizzle-orm/dsql-core';
import { render } from 'hanji';
import { ddlDiff } from '../../dialects/dsql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/dsql/drizzle';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { interimToDDL } from '../../dialects/postgres/ddl';
import type {
	JsonAddColumn,
	JsonAlterColumn,
	JsonCreateUnique,
	JsonDropColumn,
	JsonDropPrimaryKey,
	JsonDropSchema,
	JsonDropTable,
	JsonDropView,
	JsonStatement,
} from '../../dialects/postgres/statements';
import type { Table } from '../../dialects/pull-utils';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import type { DB } from '../../utils';
import { isInteractive, outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/common';
import type { DsqlCredentials } from '../validations/dsql';
import { withStyle } from '../validations/outputs';
import {
	dsqlSchemaError,
	dsqlSchemaWarning,
	EmptyProgressView,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	ProgressView,
} from '../views';

/**
 * Extracts existing entities (views marked as isExisting) from DSQL schema.
 * DSQL schemas don't have isExisting concept, only views do.
 */
const extractDsqlExisting = (
	_schemas: DSQLSchema<string>[],
	views: DSQLView[],
): Table[] => {
	const existingViews = views
		.map((x) => getViewConfig(x))
		.filter((x) => x.isExisting)
		.map<Table>((x) => ({
			type: 'table',
			schema: x.schema ?? 'public',
			name: x.name,
		}));
	return existingViews;
};

export const handle = async (
	filenames: string[],
	verbose: boolean,
	credentials: DsqlCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	explain: boolean,
	migrations: {
		table: string;
		schema: string;
	},
	hints: HintsHandler,
) => {
	const json = outputFormat() === 'json';

	const { prepareDsqlDB } = await import('./pull-dsql');
	const { introspect } = await import('./pull-dsql');

	const db = await prepareDsqlDB(credentials);
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractDsqlExisting(res.schemas, res.views);
	const entityFilter = prepareEntityFilter('postgresql', filters, existing);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(res, entityFilter);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => dsqlSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		throw new CommandOutputCliError('push', errors.map((it) => dsqlSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'dsql',
		});
	}

	const progress = json
		? new EmptyProgressView()
		: new ProgressView('Pulling schema from database...', 'Pulling schema from database...');

	const { schema: schemaFrom } = await introspect(
		db,
		entityFilter,
		progress,
		() => {},
		migrations,
	);

	const { ddl: ddl1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(schemaTo);

	if (errors1.length > 0) {
		throw new CommandOutputCliError('push', errors1.map((it) => dsqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'dsql',
		});
	}

	// DSQL doesn't support enums, policies, or privileges
	// so we use placeholder resolvers that never get called
	const { sqlStatements, statements: jsonStatements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema', hints),
		resolver<never>('enum', hints),
		resolver<Sequence>('sequence', hints),
		resolver<never>('policy', hints),
		resolver<Role>('role', hints),
		resolver<never>('privilege', hints),
		resolver<PostgresEntities['tables']>('table', hints),
		resolver<Column>('column', hints),
		resolver<View>('view', hints),
		resolver<UniqueConstraint>('unique', hints),
		resolver<Index>('index', hints),
		resolver<CheckConstraint>('check', hints),
		resolver<PrimaryKey>('primary_key', hints),
		resolver<ForeignKey>('foreign key', hints),
		'push',
	);

	if (hints.hasMissingHints()) {
		return hints.toResponse();
	}

	if (sqlStatements.length === 0) {
		if (!json) {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
		return { status: 'no_changes' as const, dialect: 'dsql' };
	}

	const suggestionHints = await suggestions(db, jsonStatements, hints);

	if (hints.hasMissingHints()) {
		return hints.toResponse();
	}

	if (explain) {
		if (json) {
			return explainJsonOutput('dsql', jsonStatements, suggestionHints);
		}
		const explainMessage = explainView('dsql', groupedStatements, suggestionHints);
		if (explainMessage) {
			humanLog(explainMessage);
		}
		return { status: 'ok' as const, dialect: 'dsql' };
	}

	if (!force && !json && isInteractive() && suggestionHints.length > 0) {
		humanLog(withStyle.warning(`There're potential issues with these statements:\n`));
		for (const h of suggestionHints) {
			humanLog(`· ${h.hint}`);
			if (h.statement) humanLog(highlightSQL(h.statement));
		}

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
		render(`[${chalk.green('✓')}] Changes applied`);
	}
	return { status: 'ok' as const, dialect: 'dsql' };
};

const identifier = (it: { schema?: string; name: string }) => {
	const { schema, name } = it;
	const schemakey = schema && schema !== 'public' ? `"${schema}".` : '';
	return `${schemakey}"${name}"`;
};

// Type guard helpers for JsonStatement discriminated union
const isDropView = (s: JsonStatement): s is JsonDropView => s.type === 'drop_view';
const isAlterColumn = (s: JsonStatement): s is JsonAlterColumn => s.type === 'alter_column';
const isDropTable = (s: JsonStatement): s is JsonDropTable => s.type === 'drop_table';
const isDropColumn = (s: JsonStatement): s is JsonDropColumn => s.type === 'drop_column';
const isDropSchema = (s: JsonStatement): s is JsonDropSchema => s.type === 'drop_schema';
const isDropPk = (s: JsonStatement): s is JsonDropPrimaryKey => s.type === 'drop_pk';
const isAddColumn = (s: JsonStatement): s is JsonAddColumn => s.type === 'add_column';
const isAddUnique = (s: JsonStatement): s is JsonCreateUnique => s.type === 'add_unique';

/**
 * Generates suggestions for potentially destructive operations.
 *
 * DSQL-specific version:
 * - No enum, policy related suggestions
 * - Warns about no transaction support (partial failures possible)
 * - Focuses on table, column, schema, index, and constraint operations
 */
export const suggestions = async (db: DB, jsonStatements: JsonStatement[], hints: HintsHandler) => {
	const json = outputFormat() === 'json';
	const useHints = json || !isInteractive();
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		// drizzle-kit push does not handle alternations of views definitions
		if (isDropView(it) && it.cause) return false;

		// Skip generated column alternations
		if (isAlterColumn(it) && it.diff?.generated) return false;

		return true;
	});

	// DSQL-specific: warn about no transaction support when multiple statements
	if (filtered.length > 1) {
		grouped.push({
			hint: `DSQL does not support transactions for DDL. ${filtered.length} statements will be executed sequentially. `
				+ `If a statement fails, previous changes will ${chalk.underline('not')} be rolled back.`,
		});
	}

	for (const statement of filtered) {
		if (isDropTable(statement)) {
			const { key } = statement;
			const entity = [statement.table.schema, statement.table.name] as const;
			if (hints.matchConfirm('table', entity)) continue;
			const res = await db.query(`select 1 from ${key} limit 1`);

			if (res.length > 0) {
				if (useHints) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'table', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint: `You're about to delete non-empty ${key} table` });
				}
			}
			continue;
		}

		if (isDropView(statement) && statement.view?.materialized) {
			const id = identifier(statement.view);
			const entity = [statement.view.schema, statement.view.name] as const;
			if (hints.matchConfirm('view', entity)) continue;
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			if (useHints) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'view', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete non-empty ${id} materialized view` });
			}
			continue;
		}

		if (isDropColumn(statement)) {
			const { column } = statement;
			const id = identifier({ schema: column.schema, name: column.table });
			const entity = [column.schema, column.table, column.name] as const;
			if (hints.matchConfirm('column', entity)) continue;
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			if (useHints) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'column', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete non-empty ${column.name} column in ${id} table` });
			}
			continue;
		}

		if (isDropSchema(statement)) {
			const { name } = statement;
			const entity = [name] as const;
			if (hints.matchConfirm('schema', entity)) continue;
			// count tables in schema
			const res = await db.query<{ count: string }>(
				`select count(*) as count from information_schema.tables where table_schema = '${name}';`,
			);
			const count = Number(res[0].count);
			if (count === 0) continue;

			if (useHints) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'schema', entity, reason: 'non_empty' });
			} else {
				grouped.push({ hint: `You're about to delete ${chalk.underline(name)} schema with ${count} tables` });
			}
			continue;
		}

		// drop pk
		if (isDropPk(statement)) {
			const { pk } = statement;
			const schema = pk.schema ?? 'public';
			const table = pk.table;
			const id = `"${schema}"."${table}"`;
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;

			const hint = `You're about to drop ${
				chalk.underline(id)
			} primary key, this statement may fail and your table may lose primary key`;

			if (pk.nameExplicit) {
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

		// add not-null column without default
		if (isAddColumn(statement)) {
			const { column } = statement;
			if (!column.notNull || column.default !== null || column.generated || column.identity) {
				continue;
			}

			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			const hint = `You're about to add not-null ${
				chalk.underline(column.name)
			} column without default value to a non-empty ${id} table`;

			grouped.push({ hint });
			continue;
		}

		// add unique constraint
		if (isAddUnique(statement)) {
			const { unique } = statement;
			const id = identifier({ schema: unique.schema, name: unique.table });

			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({
				hint: `You're about to add ${
					chalk.underline(unique.name)
				} unique constraint to a non-empty ${id} table which may fail`,
			});
			continue;
		}
	}

	return grouped;
};
