import pico from 'picocolors';
import { assert, test } from 'vitest';
import { analyzeImports, ChainLink } from '../imports-checker/checker';

test('imports-issues', () => {
	const issues = analyzeImports({
		basePath: '.',
		localPaths: ['src'],
		whiteList: [
			'@drizzle-team/brocli',
			'json-diff',
			'path',
			'fs',
			'fs/*',
			'url',
			'zod',
			'node:*',
			'hono',
			'glob',
			'hono/*',
			'hono/**/*',
			'@hono/*',
			'crypto',
			'hanji',
			'picocolors',
			'dotenv/config',
			'camelcase',
			'semver',
			'env-paths',
		],
		entry: 'src/cli/index.ts',
		logger: true,
		ignoreTypes: true,
	}).issues;

	const chainToString = (chains: ChainLink[]) => {
		if (chains.length === 0) throw new Error();

		let out = chains[0]!.file + '\n';
		let indentation = 0;
		for (let chain of chains) {
			out += ' '.repeat(indentation)
				+ '└'
				+ chain.import
				+ ` ${pico.gray(chain.file)}\n`;
			indentation += 1;
		}
		return out;
	};

	console.log();
	for (const issue of issues) {
		console.log(pico.red(issue.imports.map((it) => it.name).join('\n')));
		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
	}

	assert.equal(issues.length, 0);
});
