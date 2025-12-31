import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { interimToDDL, postgresToRelationsPull } from 'src/dialects/postgres/ddl';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { fromDatabase } from '../../dialects/postgres/introspect';
import type { prepareGelDB } from '../connections';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing } from '../validations/common';
import type { GelCredentials } from '../validations/gel';
import { IntrospectProgress } from '../views';
import { relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: GelCredentials | undefined,
	filters: EntitiesFilterConfig,
	db?: Awaited<ReturnType<typeof prepareGelDB>>,
) => {
	if (!db) {
		const { prepareGelDB } = await import('../connections');
		db = await prepareGelDB(credentials);
	}

	const progress = new IntrospectProgress(true);
	const entityFilter = prepareEntityFilter('gel', filters, []);

	const task = fromDatabase(db, entityFilter, (stage, count, status) => {
		progress.update(stage, count, status);
	});

	const res = await renderWithTask(progress, task);

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		// TODO: print errors
		process.exit(1);
	}

	const ts = ddlToTypeScript(ddl2, res.viewColumns, casing, 'gel');
	const relationsTs = relationsToTypeScript(postgresToRelationsPull(ddl2), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

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
