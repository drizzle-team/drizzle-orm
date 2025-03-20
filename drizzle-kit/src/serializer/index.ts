import chalk from 'chalk';
import fs from 'fs';
import * as glob from 'glob';
import Path from 'path';
import type { CasingType } from 'src/cli/validations/common';
import { error, schemaError, schemaWarning, sqliteSchemaError } from '../cli/views';
import type { MySqlSchemaInternal } from './mysqlSchema';
import type { PgSchemaInternal } from '../dialects/postgres/ddl';
import type { SingleStoreSchemaInternal } from './singlestoreSchema';
import type { SQLiteDDL } from '../dialects/sqlite/ddl';

export const serializeMySql = async (
	path: string | string[],
	casing: CasingType | undefined,
): Promise<MySqlSchemaInternal> => {
	const filenames = prepareFilenames(path);

	console.log(chalk.gray(`Reading schema files:\n${filenames.join('\n')}\n`));

	const { prepareFromMySqlImports } = await import('./mysqlImports');
	const { generateMySqlSnapshot } = await import('./mysqlSerializer');

	const { tables, views } = await prepareFromMySqlImports(filenames);

	return generateMySqlSnapshot(tables, views, casing);
};

export const serializePg = async (
	path: string | string[],
	casing: CasingType | undefined,
	schemaFilter?: string[],
): Promise<PgSchemaInternal> => {
	const filenames = prepareFilenames(path);

	const { prepareFromPgImports } = await import('./pgImports');
	const { generatePgSnapshot } = await import('../dialects/postgres/serializer');
	const { drizzleToInternal } = await import('./pgDrizzleSerializer');

	const { tables, enums, schemas, sequences, views, matViews, roles, policies } = await prepareFromPgImports(
		filenames,
	);
	const { schema, errors, warnings } = drizzleToInternal(
		tables,
		enums,
		schemas,
		sequences,
		roles,
		policies,
		views,
		matViews,
		casing,
		schemaFilter,
	);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => schemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => schemaError(it)).join('\n'));
		process.exit(1);
	}

	return generatePgSnapshot(schema);
};

export const serializeSingleStore = async (
	path: string | string[],
	casing: CasingType | undefined,
): Promise<SingleStoreSchemaInternal> => {
	const filenames = prepareFilenames(path);

	console.log(chalk.gray(`Reading schema files:\n${filenames.join('\n')}\n`));

	const { prepareFromSingleStoreImports } = await import('./singlestoreImports');
	const { generateSingleStoreSnapshot } = await import('./singlestoreSerializer');

	const { tables /* views */ } = await prepareFromSingleStoreImports(filenames);

	return generateSingleStoreSnapshot(tables, /* views, */ casing);
};

export const prepareFilenames = (path: string | string[]) => {
	if (typeof path === 'string') {
		path = [path];
	}
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const result = path.reduce((result, cur) => {
		const globbed = glob.sync(`${prefix}${cur}`);

		globbed.forEach((it) => {
			const fileName = fs.lstatSync(it).isDirectory() ? null : Path.resolve(it);

			const filenames = fileName
				? [fileName!]
				: fs.readdirSync(it).map((file) => Path.join(Path.resolve(it), file));

			filenames
				.filter((file) => !fs.lstatSync(file).isDirectory())
				.forEach((file) => result.add(file));
		});

		return result;
	}, new Set<string>());
	const res = [...result];

	// TODO: properly handle and test
	const errors = res.filter((it) => {
		return !(
			it.endsWith('.ts')
			|| it.endsWith('.js')
			|| it.endsWith('.cjs')
			|| it.endsWith('.mjs')
			|| it.endsWith('.mts')
			|| it.endsWith('.cts')
		);
	});

	// when schema: "./schema" and not "./schema.ts"
	if (res.length === 0) {
		console.log(
			error(
				`No schema files found for path config [${
					path
						.map((it) => `'${it}'`)
						.join(', ')
				}]`,
			),
		);
		console.log(
			error(
				`If path represents a file - please make sure to use .ts or other extension in the path`,
			),
		);
		process.exit(1);
	}

	return res;
};
