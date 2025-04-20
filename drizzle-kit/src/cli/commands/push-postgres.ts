import chalk from 'chalk';
import { render } from 'hanji';
import {
	Column,
	Enum,
	interimToDDL,
	Policy,
	PostgresEntities,
	Role,
	Schema,
	Sequence,
	View,
} from '../../dialects/postgres/ddl';
import { ddlDiff } from '../../dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/postgres/drizzle';
import type { JsonStatement } from '../../dialects/postgres/statements';
import { prepareFilenames } from '../../serializer';
import type { DB } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import { Entities } from '../validations/cli';
import { CasingType } from '../validations/common';
import { withStyle } from '../validations/outputs';
import type { PostgresCredentials } from '../validations/postgres';
import { schemaError, schemaWarning } from '../views';

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
	const { pgPushIntrospect } = await import('./pull-postgres');

	const db = await preparePostgresDB(credentials);
	const filenames = prepareFilenames(schemaPath);

	const res = await prepareFromSchemaFiles(filenames);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(
		res.schemas,
		res.tables,
		res.enums,
		res.sequences,
		res.roles,
		res.policies,
		res.views,
		res.matViews,
		casing,
	);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => schemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => schemaError(it)).join('\n'));
		process.exit(1);
	}

	const { schema: schemaFrom } = await pgPushIntrospect(db, tablesFilter, schemasFilter, entities);

	const { ddl: ddl1, errors: errors1 } = interimToDDL(schemaFrom);
	// todo: handle errors?
	const { ddl: ddl2, errors: errors2 } = interimToDDL(schemaTo);

	if (errors1.length > 0) {
		console.log(errors.map((it) => schemaError(it)).join('\n'));
		process.exit(1);
	}

	const blanks = new Set<string>();
	const { sqlStatements, statements: jsonStatements, _meta } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		mockResolver(blanks), // uniques
		mockResolver(blanks), // indexes
		mockResolver(blanks), // checks
		mockResolver(blanks), // pks
		mockResolver(blanks), // fks
		'push',
	);

	if (sqlStatements.length === 0) {
		render(`[${chalk.blue('i')}] No changes detected`);
	} else {
		const { statements, hints } = await suggestions(db, jsonStatements);

		if (verbose) {
			console.log();
			console.log(withStyle.warning('You are about to execute these statements:'));
			console.log();
			console.log(statements.map((s) => chalk.blue(s)).join('\n'));
			console.log();
		}

		if (!force && strict && hints.length === 0) {
			const { status, data } = await render(new Select(['No, abort', `Yes, I want to execute all statements`]));

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

		for (const statement of statements) {
			await db.query(statement);
		}

		if (statements.length > 0) {
			render(`[${chalk.green('✓')}] Changes applied`);
		} else {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
	}
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
			const id = identifier(statement.table);
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length > 0) hints.push(`· You're about to delete non-empty ${chalk.underline(id)} table`);
			continue;
		}

		if (statement.type === 'drop_view' && statement.view.materialized) {
			const id = identifier(statement.view);
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			hints.push(`· You're about to delete non-empty "${chalk.underline(id)}" materialized view`);
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			hints.push(`· You're about to delete non-empty ${chalk.underline(column.name)} column in ${id} table`);
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
		if (statement.type === 'alter_column' && statement.diff.primaryKey?.to === false) {
			const from = statement.from;
			const schema = from.schema ?? 'public';
			const table = from.table;
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
		statements,
		hints,
	};
};

function concatSchemaAndTableName(schema: string | undefined, table: string) {
	return schema ? `"${schema}"."${table}"` : `"${table}"`;
}

function tableNameWithSchemaFrom(
	schema: string | undefined,
	tableName: string,
	renamedSchemas: Record<string, string>,
	renamedTables: Record<string, string>,
) {
	const newSchemaName = schema ? (renamedSchemas[schema] ? renamedSchemas[schema] : schema) : undefined;

	const newTableName = renamedTables[concatSchemaAndTableName(newSchemaName, tableName)]
		? renamedTables[concatSchemaAndTableName(newSchemaName, tableName)]
		: tableName;

	return concatSchemaAndTableName(newSchemaName, newTableName);
}
