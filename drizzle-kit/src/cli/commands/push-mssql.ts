import chalk from 'chalk';
import { render } from 'hanji';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { prepareFilenames } from 'src/utils/utils-node';
import {
	CheckConstraint,
	Column,
	DefaultConstraint,
	ForeignKey,
	Index,
	interimToDDL,
	MssqlDDL,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from '../../dialects/mssql/ddl';
import { ddlDiff } from '../../dialects/mssql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/mssql/drizzle';
import type { JsonStatement } from '../../dialects/mssql/statements';
import type { DB } from '../../utils';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import { EntitiesFilterConfig, SchemasFilter, TablesFilter } from '../validations/cli';
import { CasingType } from '../validations/common';
import type { MssqlCredentials } from '../validations/mssql';
import { withStyle } from '../validations/outputs';
import { mssqlSchemaError, ProgressView } from '../views';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: MssqlCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToMsSQL } = await import('../connections');
	const { introspect } = await import('./pull-mssql');

	const { db } = await connectToMsSQL(credentials);
	const filenames = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(filenames);

	const { schema: schemaTo, errors } = fromDrizzleSchema(res, casing);

	if (errors.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}
	const drizzleSchemas = res.schemas.map((x) => x.schemaName).filter((x) => x !== 'public');
	const filter = prepareEntityFilter('mssql', { ...filters, drizzleSchemas });

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: schemaFrom } = await introspect(db, filter, progress);

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

	const { sqlStatements, statements: jsonStatements } = await ddlDiff(
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

	const { losses, hints } = await suggestions(db, jsonStatements, ddl2);

	const statementsToExecute = [...losses, ...sqlStatements];
	if (verbose) {
		console.log();
		console.log(withStyle.warning('You are about to execute these statements:'));
		console.log();
		console.log(statementsToExecute.map((s) => chalk.blue(s)).join('\n'));
		console.log();
	}

	if (!force && strict && hints.length === 0) {
		const { status, data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	if (!force && hints.length > 0) {
		console.log(withStyle.warning('Found data-loss statements:'));
		console.log(hints.join('\n'));
		console.log();
		console.log(
			chalk.red.bold(
				'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
			),
		);

		console.log(chalk.white('Do you still want to push changes?'));

		const { status, data } = await render(new Select(['No, abort', `Yes, proceed`]));
		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	for (const statement of statementsToExecute) {
		await db.query(statement);
	}

	render(`[${chalk.green('✓')}] Changes applied`);
};

const identifier = (it: { schema?: string; table: string }) => {
	const { schema, table } = it;

	const schemaKey = schema && schema !== 'dbo' ? `[${schema}].` : '';
	const tableKey = `[${table}]`;

	return `${schemaKey}${tableKey}`;
};

export const suggestions = async (db: DB, jsonStatements: JsonStatement[], ddl2: MssqlDDL) => {
	const losses: string[] = [];
	const hints = [] as string[];

	const filtered = jsonStatements.filter((it) => {
		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const tableName = identifier({ schema: statement.table.schema, table: statement.table.name });
			const res = await db.query(`select top(1) 1 from ${tableName};`);

			if (res.length > 0) hints.push(`· You're about to delete non-empty [${statement.table.name}] table`);
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;

			const key = identifier({ schema: column.schema, table: column.table });

			const res = await db.query(`SELECT TOP(1) 1 FROM ${key} WHERE [${column.name}] IS NOT NULL;`);
			if (res.length === 0) continue;

			hints.push(`· You're about to delete non-empty [${column.name}] column in [${column.table}] table`);
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
			hints.push(
				`· You're about to delete [${statement.name}] schema with ${count} ${tableGrammar}`,
			);
			continue;
		}

		// add column with not null without default
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
			const res = await db.query(`select top(1) 1 from ${key}`);

			if (res.length === 0) continue;

			hints.push(
				`· You're about to add not-null [${column.name}] column without default value to a non-empty ${key} table`,
			);

			losses.push(`DELETE FROM ${key};`);

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
			hints.push(
				`· You're about to add not-null to [${statement.diff.$right.name}] column without default value to a non-empty ${key} table`,
			);

			losses.push(`DELETE FROM ${key};`);

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
				hints.push(
					`· You're about to drop ${
						chalk.underline(id)
					} primary key, this statements may fail and your table may loose primary key`,
				);
			}

			continue;
		}

		if (statement.type === 'add_unique') {
			const unique = statement.unique;
			const id = identifier({ schema: unique.schema, table: unique.table });

			const res = await db.query(`select top(1) 1 from ${id};`);
			if (res.length === 0) continue;

			hints.push(
				`· You're about to add ${
					chalk.underline(unique.name)
				} unique constraint to a non-empty ${id} table which may fail`,
			);

			continue;
		}

		// TODO should we abort process here?
		if (
			statement.type === 'rename_column'
			&& ddl2.checks.one({ schema: statement.to.schema, table: statement.to.table })
		) {
			const left = statement.from;
			const right = statement.to;

			hints.push(
				`· You are trying to rename column from ${left.name} to ${right.name}, but it is not possible to rename a column if it is used in a check constraint on the table.
To rename the column, first drop the check constraint, then rename the column, and finally recreate the check constraint`,
			);

			continue;
		}

		if (statement.type === 'rename_schema') {
			const left = statement.from;
			const right = statement.to;

			hints.push(
				`· You are trying to rename schema ${left.name} to ${right.name}, but it is not supported to rename a schema in mssql.
You should create new schema and transfer everything to it`,
			);

			continue;
		}

		// TODO add this in future for corner cases
		// Probably we should add `isDrizzleSql` field to grammar.ts types
		// This will help us to validate that if drizzle sql changed to other drizzle sql
		// Then we should hint user that database can store this in different format and that probably can be same, but diff will be found anyway
		// ex: drizzleSql: 10 + 10 + 10 => db: ((10) + (10)) + (10)
		// if (statement.type === 'recreate_default' && statement.from.default && statement.to.default && statement.baseType) {
		// 	hints.push(
		// 		`· You are about to drop and recreate a DEFAULT constraint.
		// Your current value: ${statement.to.default}
		// Value returned from the database: ${statement.from.default}

		// If both values are the same for you, it's recommended to replace your SQL with the value returned from the database to avoid unnecessary changes`,
		// 	);
		// 	continue;
		// }
	}

	return {
		losses,
		hints,
	};
};
