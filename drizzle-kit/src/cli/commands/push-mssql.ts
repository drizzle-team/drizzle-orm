import chalk from 'chalk';
import { render } from 'hanji';
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
import { Entities } from '../validations/cli';
import { CasingType } from '../validations/common';
import type { MssqlCredentials } from '../validations/mssql';
import { ProgressView } from '../views';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: MssqlCredentials,
	tablesFilter: string[],
	schemasFilter: string[],
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { connectToMsSQL } = await import('../connections');
	const { introspect } = await import('./pull-mssql');

	const { db } = await connectToMsSQL(credentials);
	const filenames = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(filenames);

	const schemaTo = fromDrizzleSchema(res, casing);

	// TODO handle warnings?
	// if (warnings.length > 0) {
	// 	console.log(warnings.map((it) => schemaWarning(it)).join('\n\n'));
	// }

	// if (errors.length > 0) {
	// 	console.log(errors.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: schemaFrom } = await introspect(db, tablesFilter, schemasFilter, progress);

	const { ddl: ddl1, errors: errors1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors2 } = interimToDDL(schemaTo);
	// todo: handle errors?

	// if (errors1.length > 0) {
	// 	console.log(errors.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

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

	// TODO handle suggestions, froce flag
	const { losses, hints } = await suggestions(db, jsonStatements, ddl2);

	const statementsToExecute = [...losses, ...sqlStatements];
	// if (verbose) {
	// 	console.log();
	// 	console.log(withStyle.warning('You are about to execute these statements:'));
	// 	console.log();
	// 	console.log(statementsToExecute.map((s) => chalk.blue(s)).join('\n'));
	// 	console.log();
	// }

	// if (!force && strict && hints.length === 0) {
	// 	const { status, data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));

	// 	if (data?.index === 0) {
	// 		render(`[${chalk.red('x')}] All changes were aborted`);
	// 		process.exit(0);
	// 	}
	// }

	// if (!force && hints.length > 0) {
	// 	console.log(withStyle.warning('Found data-loss statements:'));
	// 	console.log(losses.join('\n'));
	// 	console.log();
	// 	console.log(
	// 		chalk.red.bold(
	// 			'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
	// 		),
	// 	);

	// 	console.log(chalk.white('Do you still want to push changes?'));

	// 	const { status, data } = await render(new Select(['No, abort', `Yes, proceed`]));
	// 	if (data?.index === 0) {
	// 		render(`[${chalk.red('x')}] All changes were aborted`);
	// 		process.exit(0);
	// 	}
	// }

	for (const statement of statementsToExecute) {
		await db.query(statement);
	}

	render(`[${chalk.green('✓')}] Changes applied`);
};

const identifier = (it: { schema?: string; name: string }) => {
	const { schema, name } = it;
	const schemakey = schema && schema !== 'dbo' ? `[${schema}].` : '';
	return `${schemakey}[${name}]`;
};

export const suggestions = async (db: DB, jsonStatements: JsonStatement[], ddl2: MssqlDDL) => {
	const statements: string[] = [];
	const hints = [] as string[];

	const filtered = jsonStatements.filter((it) => {
		// TODO need more here?
		if (it.type === 'recreate_view') return false;

		if (it.type === 'alter_column' && it.diff.generated) return false;

		return true;
	});

	for (const statement of filtered) {
		if (statement.type === 'drop_table') {
			const id = identifier(statement.table);
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length > 0) hints.push(`· You're about to delete non-empty ${id} table`);
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			hints.push(`· You're about to delete non-empty ${column.name} column in ${id} table`);
			continue;
		}

		if (statement.type === 'drop_schema') {
			// count tables in schema
			const res = await db.query(
				`select count(*) as count from information_schema.tables where table_schema = '${statement.name}';`,
			);
			const count = Number(res[0].count);
			if (count === 0) continue;

			hints.push(`· You're about to delete ${chalk.underline(statement.name)} schema with ${count} tables`);
			continue;
		}

		// drop pk
		if (statement.type === 'drop_pk') {
			const schema = statement.pk.schema ?? 'dbo';
			const table = statement.pk.table;
			const id = identifier({ name: table, schema: schema });
			const res = await db.query(
				`select 1 from ${id} limit 1`,
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

		if (
			statement.type === 'add_column' && statement.column.notNull
			&& ddl2.defaults.one({
				column: statement.column.name,
				schema: statement.column.schema,
				table: statement.column.table,
			})
		) {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			hints.push(
				`· You're about to add not-null ${
					chalk.underline(statement.column.name)
				} column without default value to a non-empty ${id} table`,
			);

			continue;
		}

		if (statement.type === 'add_unique') {
			const unique = statement.unique;
			const id = identifier({ schema: unique.schema, name: unique.table });

			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			console.log(
				`· You're about to add ${
					chalk.underline(unique.name)
				} unique constraint to a non-empty ${id} table which may fail`,
			);
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

	return {
		losses: statements,
		hints,
	};
};
