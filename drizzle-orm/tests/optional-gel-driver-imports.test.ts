import path from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';

test('node-postgres types do not load the optional gel driver', () => {
	const configPath = path.resolve('tsconfig.json');
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
	const entryPoint = path.resolve('src/node-postgres/index.ts');

	expect(configFile.error).toBeUndefined();
	expect(config.errors).toEqual([]);
	// gel is a development dependency, so a missing installation cannot hide a regression.
	expect(ts.resolveModuleName('gel', entryPoint, config.options, ts.sys).resolvedModule).toBeDefined();

	const program = ts.createProgram([entryPoint], config.options);
	const gelDriverFiles = program.getSourceFiles().filter((file) =>
		file.fileName.replaceAll('\\', '/').includes('/node_modules/gel/')
	);

	expect(gelDriverFiles.map((file) => file.fileName)).toEqual([]);
});
