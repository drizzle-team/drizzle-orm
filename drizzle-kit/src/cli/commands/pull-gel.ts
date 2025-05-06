import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { fromDatabase } from '../../dialects/postgres/introspect';
import { Entities } from '../validations/cli';
import { Casing, Prefix } from '../validations/common';
import { GelCredentials } from '../validations/gel';
import { IntrospectProgress } from '../views';
import { prepareTablesFilter, relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: GelCredentials | undefined,
	tablesFilter: string[],
	schemasFilter: string[],
	prefix: Prefix,
	entities: Entities,
) => {
	const { prepareGelDB } = await import('../connections');
	const db = await prepareGelDB(credentials);

	const filter = prepareTablesFilter(tablesFilter);
	const progress = new IntrospectProgress(true);

	const res = await renderWithTask(
		progress,
		fromDatabase(
			db,
			filter,
			(x) => schemasFilter.some((s) => x === s),
			entities,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
		),
	);

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		// TODO: print errors
		process.exit(1);
	}

	const ts = ddlToTypeScript(ddl2, res.viewColumns, casing, 'gel');
	const relationsTs = relationsToTypeScript(ddl2.fks.list(), casing);

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
	process.exit(0);
};
