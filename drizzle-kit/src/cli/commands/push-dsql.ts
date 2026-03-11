/**
 * DSQL Push Command
 *
 * Pushes schema changes to a DSQL database cluster.
 *
 * DSQL-specific behavior:
 * - No transaction support (each DDL statement auto-commits)
 * - Uses CREATE INDEX ASYNC instead of CONCURRENTLY
 * - Simplified suggestions (no enums, sequences, FKs, policies)
 */

import chalk from 'chalk';
import { getViewConfig } from 'drizzle-orm/dsql-core';
import type { DSQLSchema, DSQLView } from 'drizzle-orm/dsql-core';
import { render } from 'hanji';
import type { Table } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { ddlDiff } from '../../dialects/dsql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/dsql/drizzle';
import type {
	CheckConstraint,
	Column,
	Index,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
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
import type { DB } from '../../utils';
import { prepareFilenames } from '../../utils/utils-node';
import { highlightSQL } from '../highlighter';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { DsqlCredentials } from '../validations/dsql';
import { dsqlSchemaError, dsqlSchemaWarning, explain, ProgressView } from '../views';

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
	schemaPath: string | string[],
	verbose: boolean,
	credentials: DsqlCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	casing: CasingType | undefined,
	explainFlag: boolean,
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const { prepareDsqlDB } = await import('./pull-dsql');
	const { introspect } = await import('./pull-dsql');

	const db = await prepareDsqlDB(credentials);
	const filenames = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractDsqlExisting(res.schemas, res.views);
	const entityFilter = prepareEntityFilter('postgresql', filters, existing);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(res, casing, entityFilter);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => dsqlSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => dsqlSchemaError(it)).join('\n'));
		process.exit(1);
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

	if (errors1.length > 0) {
		console.log(errors1.map((it) => dsqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	// DSQL doesn't support enums, sequences, policies, privileges, or foreign keys
	// so we use placeholder resolvers that never get called
	const { sqlStatements, statements: jsonStatements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema'),
		resolver<never>('enum'),
		resolver<never>('sequence'),
		resolver<never>('policy'),
		resolver<Role>('role'),
		resolver<never>('privilege'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary key'),
		resolver<never>('foreign key'),
		'push',
	);

	if (sqlStatements.length === 0) {
		render(`[${chalk.blue('i')}] No changes detected`);
		return;
	}

	const hints = await suggestions(db, jsonStatements);
	const explainMessage = explain('dsql', groupedStatements, explainFlag, hints);

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

	render(`[${chalk.green('✓')}] Changes applied`);
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
 * - No enum, sequence, policy, FK related suggestions
 * - Warns about no transaction support (partial failures possible)
 * - Focuses on table, column, schema, index, and constraint operations
 */
export const suggestions = async (db: DB, jsonStatements: JsonStatement[]) => {
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
			hint:
				`· DSQL does not support transactions for DDL. ${filtered.length} statements will be executed sequentially. `
				+ `If a statement fails, previous changes will ${chalk.underline('not')} be rolled back.`,
		});
	}

	for (const statement of filtered) {
		if (isDropTable(statement)) {
			const { key } = statement;
			const res = await db.query(`select 1 from ${key} limit 1`);

			if (res.length > 0) {
				grouped.push({ hint: `· You're about to delete non-empty ${key} table` });
			}
			continue;
		}

		if (isDropView(statement) && statement.view?.materialized) {
			const id = identifier(statement.view);
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({ hint: `· You're about to delete non-empty ${id} materialized view` });
			continue;
		}

		if (isDropColumn(statement)) {
			const { column } = statement;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({ hint: `· You're about to delete non-empty ${column.name} column in ${id} table` });
			continue;
		}

		if (isDropSchema(statement)) {
			const { name } = statement;
			// count tables in schema
			const res = await db.query<{ count: string }>(
				`select count(*) as count from information_schema.tables where table_schema = '${name}';`,
			);
			const count = Number(res[0].count);
			if (count === 0) continue;

			grouped.push({
				hint: `· You're about to delete ${chalk.underline(name)} schema with ${count} tables`,
			});
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

			const hint = `· You're about to drop ${
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
			const hint = `· You're about to add not-null ${
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
				hint: `· You're about to add ${
					chalk.underline(unique.name)
				} unique constraint to a non-empty ${id} table which may fail`,
			});
			continue;
		}
	}

	return grouped;
};
