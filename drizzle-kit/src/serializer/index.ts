import chalk from 'chalk';
import type { SQL } from 'drizzle-orm';
import fs from 'fs';
import * as glob from 'glob';
import Path from 'path';
import { error } from '../cli/views';
import type { MySqlSchemaInternal } from './mysqlSchema';
import type { PgSchemaInternal } from './pgSchema';
import type { SQLiteSchemaInternal } from './sqliteSchema';

export const sqlToStr = (sql: SQL) => {
	return sql.toQuery({
		escapeName: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeParam: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeString: () => {
			throw new Error("we don't support params for `sql` default values");
		},
	}).sql;
};

export const sqlToStrGenerated = (sql: SQL) => {
	return sql.toQuery({
		escapeName: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeParam: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeString: () => {
			throw new Error("we don't support params for `sql` default values");
		},
	}).sql;
};

export const serializeMySql = async (
	path: string | string[],
): Promise<MySqlSchemaInternal> => {
	const filenames = prepareFilenames(path);

	console.log(chalk.gray(`Reading schema files:\n${filenames.join('\n')}\n`));

	const { prepareFromMySqlImports } = await import('./mysqlImports');
	const { generateMySqlSnapshot } = await import('./mysqlSerializer');

	const { tables } = await prepareFromMySqlImports(filenames);

	return generateMySqlSnapshot(tables);
};

export const serializePg = async (
	path: string | string[],
	schemaFilter?: string[],
): Promise<PgSchemaInternal> => {
	const filenames = prepareFilenames(path);

	const { prepareFromPgImports } = await import('./pgImports');
	const { generatePgSnapshot } = await import('./pgSerializer');

	const { tables, enums, schemas, sequences, roles } = await prepareFromPgImports(
		filenames,
	);

	return generatePgSnapshot(tables, enums, schemas, sequences, roles, schemaFilter);
};

export const serializeSQLite = async (
	path: string | string[],
): Promise<SQLiteSchemaInternal> => {
	const filenames = prepareFilenames(path);

	const { prepareFromSqliteImports } = await import('./sqliteImports');
	const { generateSqliteSnapshot } = await import('./sqliteSerializer');
	const { tables } = await prepareFromSqliteImports(filenames);
	return generateSqliteSnapshot(tables);
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
