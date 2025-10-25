import chalk from 'chalk';
import { render } from 'hanji';
import {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	interimToDDL,
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
import { ddlDiff } from '../../dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/postgres/drizzle';
import type { JsonStatement } from '../../dialects/postgres/statements';
import type { DB } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { prepareFilenames } from '../../utils/utils-node';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import { Entities } from '../validations/cli';
import { CasingType } from '../validations/common';
import { withStyle } from '../validations/outputs';
import type { PostgresCredentials } from '../validations/postgres';
import { postgresSchemaError, postgresSchemaWarning, ProgressView } from '../views';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: PostgresCredentials,
	tablesFilter: string[],
	schemasFilter: string[],
	entities: Entities,
	force: boolean,
	casing: CasingType | undefined,
) => {
	const { preparePostgresDB } = await import('../connections');
	const { introspect: pgPushIntrospect } = await import('./pull-postgres');

	const db = await preparePostgresDB(credentials);
	const filenames = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(filenames);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(res, casing);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: schemaFrom } = await pgPushIntrospect(db, tablesFilter, schemasFilter, entities, progress);

	const { ddl: ddl1, errors: errors1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors2 } = interimToDDL(schemaTo);
	// todo: handle errors?

	if (errors1.length > 0) {
		console.log(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const blanks = new Set<string>();
	const { sqlStatements, statements: jsonStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<Privilege>('privilege'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary key'),
		resolver<ForeignKey>('foreign key'),
		'push',
	);

	if (sqlStatements.length === 0) {
		render(`[${chalk.blue('i')}] No changes detected`);
		return;
	}

	const { losses, hints } = await suggestions(db, jsonStatements);

	if (verbose) {
		console.log();
		console.log(withStyle.warning('You are about to execute these statements:'));
		console.log();
		console.log(losses.map((s) => chalk.blue(s)).join('\n'));
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

	for (const statement of [...losses, ...sqlStatements]) {
		await db.query(statement);
	}

	render(`[${chalk.green('✓')}] Changes applied`);
};

const identifier = (it: { schema?: string; name: string }) => {
	const { schema, name } = it;
	const schemakey = schema && schema !== 'public' ? `"${schema}".` : '';
	return `${schemakey}"${name}"`;
};

export const suggestions = async (db: DB, jsonStatements: JsonStatement[]) => {
	const statements: string[] = [];
	const hints = [] as string[];

	const filtered = jsonStatements.filter((it) => {
		// discussion -
		if (it.type === 'recreate_view') return false;

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
			const res = await db.query(`select 1 from ${statement.key} limit 1`);

			if (res.length > 0) hints.push(`· You're about to delete non-empty ${statement.key} table`);
			continue;
		}

		if (statement.type === 'drop_view' && statement.view.materialized) {
			const id = identifier(statement.view);
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			hints.push(`· You're about to delete non-empty ${id} materialized view`);
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
			const schema = statement.pk.schema ?? 'public';
			const table = statement.pk.table;
			const id = `"${schema}"."${table}"`;
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

			const [{ name: pkName }] = await db.query<{ name: string }>(`
        SELECT constraint_name as name 
        FROM information_schema.table_constraints
        WHERE 
          table_schema = '${schema}'
          AND table_name = '${table}'
          AND constraint_type = 'PRIMARY KEY';`);

			statements.push(`ALTER TABLE ${id} DROP CONSTRAINT "${pkName}"`);
			continue;
		}

		// todo: alter column to not null no default
		if (statement.type === 'add_column' && statement.column.notNull && statement.column.default === null) {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			hints.push(
				`· You're about to add not-null ${
					chalk.underline(statement.column.name)
				} column without default value to a non-empty ${id} table`,
			);

			// statementsToExecute.push(`truncate table ${id} cascade;`);
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
