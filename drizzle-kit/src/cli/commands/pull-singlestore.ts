import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { createDDL, interimToDDL, mysqlToRelationsPull } from 'src/dialects/mysql/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { ddlDiff } from 'src/dialects/singlestore/diff';
import { toJsonSnapshot } from 'src/dialects/singlestore/snapshot';
import { mockResolver } from 'src/utils/mocks';
import { prepareOutFolder } from '../../utils/utils-node';
import type { connectToSingleStore } from '../connections';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing } from '../validations/common';
import type { SingleStoreCredentials } from '../validations/singlestore';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

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

	const filter = prepareEntityFilter('singlestore', filters, []);

	const progress = new IntrospectProgress();
	const task = fromDatabaseForDrizzle(db.db, db.database, filter, (stage, count, status) => {
		progress.update(stage, count, status);
	}, migrations);
	const res = await renderWithTask(progress, task);

	const { ddl } = interimToDDL(res);

	const ts = ddlToTypeScript(ddl, res.viewColumns, casing, 'singlestore');
	const relations = relationsToTypeScript(mysqlToRelationsPull(ddl), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relations.file);
	console.log();

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

		writeResult({
			snapshot: toJsonSnapshot(ddl, [], []),
			sqlStatements,
			renames: [],
			outFolder: out,
			breakpoints,
			type: 'introspect',
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
};
