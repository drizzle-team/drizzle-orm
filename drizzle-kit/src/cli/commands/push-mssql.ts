import chalk from 'chalk';
import { render } from 'hanji';
import { extractMssqlExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { prepareFilenames } from 'src/utils/utils-node';
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
import { highlightSQL } from '../highlighter';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { MssqlCredentials } from '../validations/mssql';
import { explain, mssqlSchemaError, ProgressView } from '../views';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: MssqlCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	casing: CasingType | undefined,
	explainFlag: boolean,
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const { connectToMsSQL } = await import('../connections');
	const { introspect } = await import('./pull-mssql');

	const { db } = await connectToMsSQL(credentials);
	const filenames = prepareFilenames(schemaPath);
	console.log(chalk.gray(`Reading schema files:\n${filenames.join('\n')}\n`));
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractMssqlExisting(res.schemas, res.views);
	const filter = prepareEntityFilter('mssql', filters, existing);

	const { schema: schemaTo, errors } = fromDrizzleSchema(res, casing, filter);

	if (errors.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: schemaFrom } = await introspect(db, filter, progress, migrations);

	const { ddl: ddl1, errors: errors1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors2 } = interimToDDL(schemaTo);

	if (errors1.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	if (errors2.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements, statements: jsonStatements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema', 'dbo'),
		resolver<MssqlEntities['tables']>('table', 'dbo'),
		resolver<Column>('column', 'dbo'),
		resolver<View>('view', 'dbo'),
		resolver<UniqueConstraint>('unique', 'dbo'), // uniques
		resolver<Index>('index', 'dbo'), // indexes
		resolver<CheckConstraint>('check', 'dbo'), // checks
		resolver<PrimaryKey>('primary key', 'dbo'), // pks
		resolver<ForeignKey>('foreign key', 'dbo'), // fks
		resolver<DefaultConstraint>('default', 'dbo'), // fks
		'push',
	);

	if (sqlStatements.length === 0) {
		render(`[${chalk.blue('i')}] No changes detected`);
		return;
	}

	const hints = await suggestions(db, jsonStatements, ddl2);

	const explainMessage = explain('mssql', groupedStatements, explainFlag, hints);
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

	if (sqlStatements.length > 0) {
		render(`[${chalk.green('✓')}] Changes applied`);
	} else {
		render(`[${chalk.blue('i')}] No changes detected`);
	}
};

const identifier = (it: { schema?: string; table: string }) => {
	const { schema, table } = it;

	const schemaKey = schema && schema !== 'dbo' ? `[${schema}].` : '';
	const tableKey = `[${table}]`;

	return `${schemaKey}${tableKey}`;
};

export const suggestions = async (db: DB, jsonStatements: JsonStatement[], ddl2: MssqlDDL) => {
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const tableName = identifier({ schema: statement.table.schema, table: statement.table.name });
			const res = await db.query(`select top(1) 1 from ${tableName};`);

			if (res.length > 0) grouped.push({ hint: `· You're about to delete non-empty [${statement.table.name}] table` });
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;

			const key = identifier({ schema: column.schema, table: column.table });

			const res = await db.query(`SELECT TOP(1) 1 FROM ${key} WHERE [${column.name}] IS NOT NULL;`);
			if (res.length === 0) continue;

			grouped.push({ hint: `· You're about to delete non-empty [${column.name}] column in [${column.table}] table` });
			continue;
		}

		if (statement.type === 'drop_schema') {
			// count tables in schema
			const res = await db.query(
				`select count(*) as count from information_schema.tables where table_schema = '${statement.name}';`,
			);
			const count = Number(res[0].count);
			if (count === 0) continue;

			const tableGrammar = count === 1 ? 'table' : 'tables';
			grouped.push({ hint: `· You're about to delete [${statement.name}] schema with ${count} ${tableGrammar}` });
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
			const res = await db.query(`select top(1) 1 from ${key};`);

			if (res.length === 0) continue;
			grouped.push({
				hint:
					`· You're about to add not-null to [${statement.diff.$right.name}] column without default value to a non-empty ${key} table`,
			});

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
			const res = await db.query(`select top(1) 1 from ${key};`);

			if (res.length === 0) continue;
			grouped.push({
				hint:
					`· You're about to add not-null [${statement.column.name}] column without default value to a non-empty ${key} table`,
			});

			continue;
		}

		if (statement.type === 'drop_pk') {
			const schema = statement.pk.schema ?? 'dbo';
			const table = statement.pk.table;
			const id = identifier({ table: table, schema: schema });
			const res = await db.query(
				`select top(1) 1 from ${id};`,
			);

			if (res.length > 0) {
				grouped.push({
					hint: `· You're about to drop ${
						chalk.underline(id)
					} primary key, this statements may fail and your table may loose primary key`,
				});
			}

			continue;
		}

		if (statement.type === 'add_unique') {
			const unique = statement.unique;
			const id = identifier({ schema: unique.schema, table: unique.table });

			const res = await db.query(`select top(1) 1 from ${id};`);
			if (res.length === 0) continue;

			grouped.push({
				hint: `· You're about to add ${
					chalk.underline(unique.name)
				} unique constraint to a non-empty ${id} table which may fail`,
			});

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
					`· You are trying to rename column from ${left.name} to ${right.name}, but it is not possible to rename a column if it is used in a check constraint on the table.
To rename the column, first drop the check constraint, then rename the column, and finally recreate the check constraint`,
			});

			continue;
		}

		if (statement.type === 'rename_schema') {
			const left = statement.from;
			const right = statement.to;

			grouped.push({
				hint:
					`· You are trying to rename schema ${left.name} to ${right.name}, but it is not supported to rename a schema in mssql.
You should create new schema and transfer everything to it`,
			});

			continue;
		}
	}

	return grouped;
};
