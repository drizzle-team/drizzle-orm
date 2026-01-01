import chalk from 'chalk';
import { render } from 'hanji';
import { extractCrdbExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type {
	CheckConstraint,
	CockroachEntities,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Schema,
	Sequence,
	View,
} from '../../dialects/cockroach/ddl';
import { interimToDDL } from '../../dialects/cockroach/ddl';
import { ddlDiff } from '../../dialects/cockroach/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/cockroach/drizzle';
import type { JsonStatement } from '../../dialects/cockroach/statements';
import type { DB } from '../../utils';
import { prepareFilenames } from '../../utils/utils-node';
import { highlightSQL } from '../highlighter';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CockroachCredentials } from '../validations/cockroach';
import type { CasingType } from '../validations/common';
import { cockraochSchemaError, explain, postgresSchemaWarning, ProgressView } from '../views';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: CockroachCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	casing: CasingType | undefined,
	explainFlag: boolean,
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const { prepareCockroach } = await import('../connections');
	const { introspect: cockroachPushIntrospect } = await import('./pull-cockroach');

	const db = await prepareCockroach(credentials);
	const filenames = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractCrdbExisting(res.schemas, res.views, res.matViews);
	const filter = prepareEntityFilter('cockroach', filters, existing);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(res, casing, filter);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => cockraochSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: schemaFrom } = await cockroachPushIntrospect(
		db,
		filter,
		progress,
		() => {},
		migrations,
	);

	const { ddl: ddl1, errors: errors1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2 } = interimToDDL(schemaTo);

	if (errors1.length > 0) {
		console.log(errors1.map((it) => cockraochSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements, statements: jsonStatements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<CockroachEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
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

	const hints = await suggestions(db, jsonStatements);
	const explainMessage = explain('cockroach', groupedStatements, explainFlag, hints);

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

export const suggestions = async (db: DB, jsonStatements: JsonStatement[]) => {
	const grouped: { hint: string; statement?: string }[] = [];

	const filtered = jsonStatements.filter((it) => {
		// discussion -
		if (it.type === 'recreate_view') return false;

		/*
			drizzle-kit push does not handle alternations of views definitions
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

			if (res.length > 0) grouped.push({ hint: `· You're about to delete non-empty ${statement.key} table` });
			continue;
		}

		if (statement.type === 'drop_view' && statement.view.materialized) {
			const id = identifier(statement.view);
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({ hint: `· You're about to delete non-empty ${id} materialized view` });
			continue;
		}

		if (statement.type === 'drop_column') {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({ hint: `· You're about to delete non-empty ${column.name} column in ${id} table` });
			continue;
		}

		if (statement.type === 'drop_schema') {
			// count tables in schema
			const res = await db.query(
				`select count(*) as count from information_schema.tables where table_schema = '${statement.name}';`,
			);
			const count = Number(res[0].count);
			if (count === 0) continue;

			grouped.push({ hint: `· You're about to delete ${chalk.underline(statement.name)} schema with ${count} tables` });
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
				grouped.push({
					hint: `· You're about to drop ${
						chalk.underline(id)
					} primary key, this statements may fail and your table may loose primary key`,
				});
			}

			continue;
		}

		if (statement.type === 'add_column' && statement.column.notNull && statement.column.default === null) {
			const column = statement.column;
			const id = identifier({ schema: column.schema, name: column.table });
			const res = await db.query(`select 1 from ${id} limit 1`);

			if (res.length === 0) continue;
			grouped.push({
				hint: `· You're about to add not-null ${
					chalk.underline(statement.column.name)
				} column without default value to a non-empty ${id} table`,
			});

			continue;
		}

		if (statement.type === 'create_index' && statement.index.isUnique && !statement.newTable) {
			const unique = statement.index;
			const id = identifier({ schema: unique.schema, name: unique.table });

			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			grouped.push({
				hint: `· You're about to add ${
					chalk.underline(unique.name)
				} unique index to a non-empty ${id} table which may fail`,
			});
			continue;
		}
	}

	return grouped;
};
