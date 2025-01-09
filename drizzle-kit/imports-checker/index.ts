import chalk from 'chalk';
import { analyzeImports, ChainLink } from './checker';

const issues = analyzeImports({
	basePath: './drizzle-kit',
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
	],
	entry: './drizzle-kit/src/cli/index.ts',
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
			+ ` ${chalk.gray(chain.file)}\n`;
		indentation += 1;
	}
	return out;
};

console.log();
for (const issue of issues) {
	console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
	console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
}
