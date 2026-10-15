import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { createDDL, interimToDDL, mysqlToRelationsPull } from '../../dialects/mysql/ddl';
import { fromDatabaseForDrizzle } from '../../dialects/mysql/introspect';
import { ddlToTypeScript } from '../../dialects/mysql/typescript';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import { ddlDiff } from '../../dialects/singlestore/diff';
import { toJsonSnapshot } from '../../dialects/singlestore/snapshot';
import { mockResolver } from '../../utils/mocks';
import { prepareOutFolder } from '../../utils/utils-node';
import type { connectToSingleStore } from '../connections';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import type { EntitiesFilterConfig } from '../validations/common';
import type { Casing } from '../validations/common';
import type { SingleStoreCredentials } from '../validations/singlestore';
import { humanLog, IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript, summarizeSchemaMappingErrors } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SingleStoreCredentials,
	filters: EntitiesFilterConfig,
	migrations: {
		schema: string;
		table: string;
	},
	db?: Awaited<ReturnType<typeof connectToSingleStore>>,
) => {
	if (!db) {
		const { connectToSingleStore } = await import('../connections');
		db = await connectToSingleStore(credentials);
	}

	const text = outputFormat() === 'text';
	const filter = prepareEntityFilter('singlestore', filters, []);

	let res: Awaited<ReturnType<typeof fromDatabaseForDrizzle>>;
	if (text) {
		const progress = new IntrospectProgress();
		const task = fromDatabaseForDrizzle(db.db, db.database, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}, migrations);
		res = await renderWithTask(progress, task);
	} else {
		res = await fromDatabaseForDrizzle(db.db, db.database, filter, () => {}, migrations);
	}

	const { ddl, errors } = interimToDDL(res);

	if (errors.length > 0) {
		throw new CommandOutputCliError('pull', 'Failed to map the introspected schema', {
			errors: summarizeSchemaMappingErrors(errors),
		});
	}

	const ts = ddlToTypeScript(ddl, res.viewColumns, casing, 'singlestore');
	const relations = relationsToTypeScript(mysqlToRelationsPull(ddl), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relations.file);
	humanLog();

	let snapshotPath: string;
	let migrationPath: string | undefined;
	const { snapshots } = prepareOutFolder(out);

	if (snapshots.length === 0) {
		const { sqlStatements } = await ddlDiff(
			createDDL(),
			ddl,
			mockResolver(new Set()),
			mockResolver(new Set()),
			mockResolver(new Set()),
			'push',
		);

		({ snapshotPath, migrationPath } = writeResult({
			snapshot: toJsonSnapshot(ddl, [], []),
			sqlStatements,
			renames: [],
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
