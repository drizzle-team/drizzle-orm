import chalk from 'chalk';
import { is } from 'drizzle-orm';
import { AnySQLiteTable, SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import * as esbuild from 'esbuild';
import { mkdtemp, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, SQLiteTable)) {
			tables.push(t);
		}

		if (is(t, SQLiteView)) {
			views.push(t);
		}
	});

	return { tables, views };
};

export const prepareFromSqliteImports = async (imports: string[]) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];

	const { unregister } = await safeRegister();

	const outDir = await mkdtemp('.drizzle-kit.sqlite-imports-');
	let outFile = resolve(join(outDir, 'schema.js'));
	console.log(chalk.grey(`Reading schema files '${JSON.stringify(imports)}'`));
	const res = esbuild.buildSync({
		entryPoints: imports,
		bundle: true,
		format: 'cjs',
		outfile: outFile,
	});
	const i0: Record<string, unknown> = require(outFile);
	const prepared = prepareFromExports(i0);

	await rm(outDir, { recursive: true });

	tables.push(...prepared.tables);
	views.push(...prepared.views);

	unregister();

	return { tables: Array.from(new Set(tables)), views };
};
