import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask, TaskView } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { toJsonSnapshot } from 'src/dialects/sqlite/snapshot';
import { ddlDiffDry } from '../../dialects/sqlite/diff';
import { fromDatabase, fromDatabaseForDrizzle } from '../../dialects/sqlite/introspect';
import { ddlToTypescript as sqliteSchemaToTypeScript } from '../../dialects/sqlite/typescript';
import { originUUID } from '../../global';
import type { SQLiteDB } from '../../utils';
import { prepareOutFolder } from '../../utils-node';
import { Casing, Prefix } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import { IntrospectProgress, type IntrospectStage, type IntrospectStatus, type ProgressView } from '../views';
import { writeResult } from './generate-common';
import { prepareTablesFilter, relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SqliteCredentials,
	tablesFilter: string[],
	prefix: Prefix,
	type: 'sqlite' | 'libsql' = 'sqlite',
) => {
	const { connectToSQLite } = await import('../connections');
	const db = await connectToSQLite(credentials);

	const progress = new IntrospectProgress();

	const { ddl, viewColumns } = await sqliteIntrospect(db, tablesFilter, progress, (stage, count, status) => {
		progress.update(stage, count, status);
	});

	const ts = sqliteSchemaToTypeScript(ddl, casing, viewColumns, type);
	const relationsTs = relationsToTypeScript(ddl.fks.list(), casing);

	// check orm and orm-pg api version
	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);

	console.log();
	const { snapshots, journal } = prepareOutFolder(out, 'sqlite');

	if (snapshots.length === 0) {
		const { sqlStatements, renames } = await ddlDiffDry(ddl, 'generate');

		writeResult({
			snapshot: toJsonSnapshot(ddl, originUUID, '', renames),
			sqlStatements,
			journal,
			renames,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			prefixMode: prefix,
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

export const sqliteIntrospect = async (
	db: SQLiteDB,
	filters: string[],
	taskView: TaskView,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
) => {
	const filter = prepareTablesFilter(filters);

	const schema = await renderWithTask(taskView, fromDatabaseForDrizzle(db, filter, progressCallback));
	const res = interimToDDL(schema);
	return { ...res, viewColumns: schema.viewsToColumns };
};
