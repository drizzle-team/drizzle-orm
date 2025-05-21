import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { toJsonSnapshot } from 'src/dialects/mysql/snapshot';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { diffDDL } from 'src/dialects/singlestore/diff';
import { mockResolver } from 'src/utils/mocks';
import { prepareOutFolder } from '../../utils/utils-node';
import type { Casing, Prefix } from '../validations/common';
import { SingleStoreCredentials } from '../validations/singlestore';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { prepareTablesFilter, relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SingleStoreCredentials,
	tablesFilter: string[],
	prefix: Prefix,
) => {
	const { connectToSingleStore } = await import('../connections');
	const { db, database } = await connectToSingleStore(credentials);

	const filter = prepareTablesFilter(tablesFilter);

	const progress = new IntrospectProgress();
	const res = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(db, database, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);

	const { ddl } = interimToDDL(res);

	const ts = ddlToTypeScript(ddl, res.viewColumns, casing);
	const relations = relationsToTypeScript(ddl.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relations.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'mysql');

	if (snapshots.length === 0) {
		const { sqlStatements } = await diffDDL(
			createDDL(),
			ddl,
			mockResolver(new Set()),
			mockResolver(new Set()),
			mockResolver(new Set()),
			'push',
		);

		writeResult({
			snapshot: toJsonSnapshot(ddl, '', []),
			sqlStatements,
			journal,
			renames: [],
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
	process.exit(0);
};
