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
import { isJsonMode } from '../context';
import { highlightSQL } from '../highlighter';
import type { HintsHandler } from '../hints';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CockroachCredentials } from '../validations/cockroach';
import type { CasingType } from '../validations/common';
import {
	cockroachSchemaError,
	explain as explainView,
	explainJsonOutput,
	humanLog,
	postgresSchemaWarning,
	printJsonOutput,
	ProgressView,
} from '../views';

export const handle = async (
	filenames: string[],
	verbose: boolean,
	credentials: CockroachCredentials,
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

	const { prepareCockroach } = await import('../connections');
	const { introspect: cockroachPushIntrospect } = await import('./pull-cockroach');

	const db = await prepareCockroach(credentials);
	const res = await prepareFromSchemaFiles(filenames);

	const existing = extractCrdbExisting(res.schemas, res.views, res.matViews);
	const filter = prepareEntityFilter('cockroach', filters, existing);

	const { schema: schemaTo, errors, warnings } = fromDrizzleSchema(res, casing, filter);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		process.stderr.write(errors.map((it) => cockroachSchemaError(it)).join('\n') + '\n');
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

	const { ddl: ddl1 } = interimToDDL(schemaFrom);
	const { ddl: ddl2, errors: errors1 } = interimToDDL(schemaTo);
	// TODO: handle errors?

	if (errors1.length > 0) {
		process.stderr.write(errors1.map((it) => cockroachSchemaError(it)).join('\n') + '\n');
		process.exit(1);
	}

	let sqlStatements: string[] = [];
	let jsonStatements: JsonStatement[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];

	const diffResult = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema', 'public', 'push', hints),
		resolver<Enum>('enum', 'public', 'push', hints),
		resolver<Sequence>('sequence', 'public', 'push', hints),
		resolver<Policy>('policy', 'public', 'push', hints),
		resolver<CockroachEntities['tables']>('table', 'public', 'push', hints),
		resolver<Column>('column', 'public', 'push', hints),
		resolver<View>('view', 'public', 'push', hints),
		resolver<Index>('index', 'public', 'push', hints),
		resolver<CheckConstraint>('check', 'public', 'push', hints),
		resolver<PrimaryKey>('primary key', 'public', 'push', hints),
		resolver<ForeignKey>('foreign key', 'public', 'push', hints),
		'push',
	);

	sqlStatements = diffResult.sqlStatements;
	jsonStatements = diffResult.statements;
	groupedStatements = diffResult.groupedStatements;

	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}

	if (sqlStatements.length === 0) {
		if (json) {
			printJsonOutput(explainJsonOutput('cockroach', [], []), true);
		} else {
			render(`[${chalk.blue('i')}] No changes detected`);
		}
		return;
	}

	const suggestionHints = await suggestions(db, jsonStatements, hints);
	if (hints.hasMissingHints()) {
		hints.emitAndExit();
	}
	if (explain) {
		if (json) {
			printJsonOutput(explainJsonOutput('cockroach', jsonStatements, suggestionHints), true);
		} else {
			const explainMessage = explainView('cockroach', groupedStatements, suggestionHints);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}
	if (!force && suggestionHints.length > 0) {
		if (json) {
			printJsonOutput({ status: 'aborted', dialect: 'cockroach' }, true);
			process.exit(0);
		}
		const { data } = await render(new Select(['No, abort', 'Yes, I want to execute all statements']));
		if (data?.index === 0) {
			render(`[${chalk.red('x')}] All changes were aborted`);
			process.exit(0);
		}
	}

	const lossStatements = suggestionHints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');

	for (const statement of [...lossStatements, ...sqlStatements]) {
		if (verbose && !json) humanLog(highlightSQL(statement));

		await db.query(statement);
	}

	if (json) {
		printJsonOutput({ status: 'ok', dialect: 'cockroach', message: 'Changes applied' }, true);
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
				grouped.push({ hint: `You're about to delete ${chalk.underline(statement.name)} schema with ${count} tables` });
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

			if (res.length > 0) {
				const hint = `You're about to drop ${
					chalk.underline(id)
				} primary key, these statements may fail and your table may lose the primary key`;

				if (json) {
					hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'primary_key', entity, reason: 'non_empty' });
				} else {
					grouped.push({ hint });
				}
			}

			continue;
		}

		if (statement.type === 'add_column' && statement.column.notNull && statement.column.default === null) {
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

			continue;
		}

		if (statement.type === 'create_index' && statement.index.isUnique && !statement.newTable) {
			const unique = statement.index;
			const id = identifier({ schema: unique.schema, name: unique.table });
			const uniqueColumn = unique.columns[0];
			const entity: [string, string, string] = [unique.schema, unique.table, uniqueColumn?.value ?? unique.name];
			if (hints.matchConfirm('add_unique', entity)) continue;

			const res = await db.query(`select 1 from ${id} limit 1`);
			if (res.length === 0) continue;

			if (json) {
				hints.pushMissingHint({ type: 'confirm_data_loss', kind: 'add_unique', entity, reason: 'duplicates_present' });
			} else {
				grouped.push({
					hint: `You're about to add ${
						chalk.underline(unique.name)
					} unique index to a non-empty ${id} table which may fail`,
				});
			}
			continue;
		}
	}

	return grouped;
};
