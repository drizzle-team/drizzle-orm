import path from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';

test('node-postgres types do not load the optional mysql2 driver', () => {
	const configPath = path.resolve('tsconfig.json');
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
	const entryPoint = path.resolve('src/node-postgres/index.ts');

	expect(configFile.error).toBeUndefined();
	expect(config.errors).toEqual([]);
	// mysql2 is a development dependency, so a missing installation cannot hide a regression.
	expect(ts.resolveModuleName('mysql2', entryPoint, config.options, ts.sys).resolvedModule).toBeDefined();

	const program = ts.createProgram([entryPoint], config.options);
	const mysqlDriverFiles = program.getSourceFiles().filter((file) =>
		file.fileName.replaceAll('\\', '/').includes('/node_modules/mysql2/')
	);

	expect(mysqlDriverFiles.map((file) => file.fileName)).toEqual([]);
});
