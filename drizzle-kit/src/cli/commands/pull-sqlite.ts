import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import type { EntityFilter } from '../../dialects/pull-utils';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import { createDDL, interimToDDL, sqliteToRelationsPull } from '../../dialects/sqlite/ddl';
import { ddlDiffDry } from '../../dialects/sqlite/diff';
import { fromDatabaseForDrizzle } from '../../dialects/sqlite/introspect';
import { toJsonSnapshot } from '../../dialects/sqlite/snapshot';
import { ddlToTypeScript } from '../../dialects/sqlite/typescript';
import { originUUID } from '../../utils';
import type { SQLiteDB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { connectToSQLite } from '../connections';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import type { EntitiesFilterConfig } from '../validations/common';
import type { Casing } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import { humanLog, IntrospectProgress, type IntrospectStage, type IntrospectStatus } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript, summarizeSchemaMappingErrors } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SqliteCredentials,
	filters: EntitiesFilterConfig,
	type: 'sqlite' | 'libsql' = 'sqlite',
	migrations: {
		table: string;
		schema: string;
	},
	db?: Awaited<ReturnType<typeof connectToSQLite>>,
) => {
	if (!db) {
		const { connectToSQLite } = await import('../connections');
		db = await connectToSQLite(credentials);
	}

	const text = outputFormat() === 'text';
	const filter = prepareEntityFilter('sqlite', filters, []);
	let ddl: ReturnType<typeof interimToDDL>['ddl'];
	let errors: ReturnType<typeof interimToDDL>['errors'];
	let viewColumns: Awaited<ReturnType<typeof fromDatabaseForDrizzle>>['viewsToColumns'];
	if (text) {
		const progress = new IntrospectProgress();
		({ ddl, errors, viewColumns } = await introspect(db, filter, progress, (stage, count, status) => {
			progress.update(stage, count, status);
		}, migrations));
	} else {
		const schema = await fromDatabaseForDrizzle(db, filter, () => {}, migrations);
		({ ddl, errors } = interimToDDL(schema));
		viewColumns = schema.viewsToColumns;
	}

	if (errors.length > 0) {
		throw new CommandOutputCliError('pull', 'Failed to map the introspected schema', {
			errors: summarizeSchemaMappingErrors(errors),
		});
	}

	const ts = ddlToTypeScript(ddl, casing, viewColumns, type);
	const relationsTs = relationsToTypeScript(sqliteToRelationsPull(ddl), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);

	humanLog();
	let snapshotPath: string;
	let migrationPath: string | undefined;
	const { snapshots } = prepareOutFolder(out);

	if (snapshots.length === 0) {
		const { sqlStatements, renames } = await ddlDiffDry(createDDL(), ddl, 'default');

		({ snapshotPath, migrationPath } = writeResult({
			snapshot: toJsonSnapshot(ddl, originUUID, [], renames),
			sqlStatements,
			renames,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			snapshots,
		}));
	} else {
		snapshotPath = snapshots[snapshots.length - 1];
		if (text) {
			render(
				`[${
					chalk.blue(
						'i',
					)
				}] No SQL generated, you already have migrations in project`,
			);
		}
	}

	if (text) {
		render(
			`[${
				chalk.green(
					'✓',
				)
			}] Your schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
		);
		render(
			`[${
				chalk.green(
					'✓',
				)
			}] Your relations file is ready ➜ ${
				chalk.bold.underline.blue(
					relationsFile,
				)
			} 🚀`,
		);
	}

	return {
		schemaPath: schemaFile,
		relationsPath: relationsFile,
		snapshotPath,
		...(migrationPath ? { migrationPath } : {}),
	};
};

export const introspect = async (
	db: SQLiteDB,
	filter: EntityFilter,
	taskView: TaskView,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const schema = await renderWithTask(taskView, fromDatabaseForDrizzle(db, filter, progressCallback, migrations));
	const res = interimToDDL(schema);
	return { ...res, viewColumns: schema.viewsToColumns };
};
