import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import type { EntityFilter } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { createDDL, interimToDDL } from 'src/dialects/sqlite/ddl';
import { toJsonSnapshot } from 'src/dialects/sqlite/snapshot';
import { ddlDiffDry } from '../../dialects/sqlite/diff';
import { fromDatabaseForDrizzle } from '../../dialects/sqlite/introspect';
import { ddlToTypeScript } from '../../dialects/sqlite/typescript';
import { originUUID } from '../../utils';
import type { SQLiteDB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing, Prefix } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import { IntrospectProgress, type IntrospectStage, type IntrospectStatus } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SqliteCredentials,
	filters: EntitiesFilterConfig,
	prefix: Prefix,
	type: 'sqlite' | 'libsql' = 'sqlite',
) => {
	const { connectToSQLite } = await import('../connections');
	const db = await connectToSQLite(credentials);

	const progress = new IntrospectProgress();
	const filter = prepareEntityFilter('sqlite', { ...filters, drizzleSchemas: [] });
	const { ddl, viewColumns } = await introspect(db, filter, progress, (stage, count, status) => {
		progress.update(stage, count, status);
	});

	const ts = ddlToTypeScript(ddl, casing, viewColumns, type);
	const relationsTs = relationsToTypeScript(ddl.fks.list(), casing);

	// check orm and orm-pg api version
	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);

	console.log();
	const { snapshots } = prepareOutFolder(out);

	if (snapshots.length === 0) {
		const { sqlStatements, renames } = await ddlDiffDry(createDDL(), ddl, 'default');

		writeResult({
			snapshot: toJsonSnapshot(ddl, originUUID, [], renames),
			sqlStatements,
			renames,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			prefixMode: prefix,
			snapshots,
		});
	} else {
		render(
			`[${
				chalk.blue(
					'i',
				)
			}] No SQL generated, you already have migrations in project`,
		);
	}

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] You schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
	);
	render(
		`[${
			chalk.green(
				'✓',
			)
		}] You relations file is ready ➜ ${
			chalk.bold.underline.blue(
				relationsFile,
			)
		} 🚀`,
	);
	process.exit(0);
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
) => {
	const schema = await renderWithTask(taskView, fromDatabaseForDrizzle(db, filter, progressCallback));
	const res = interimToDDL(schema);
	return { ...res, viewColumns: schema.viewsToColumns };
};
