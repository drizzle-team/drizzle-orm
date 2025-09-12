import chalk from 'chalk';
import { assert, test } from 'vitest';
import { analyzeImports, ChainLink } from '../imports-checker/checker';

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

test('imports-issues', () => {
	const issues = analyzeImports({
		basePath: '.',
		localPaths: ['src'],
		whiteList: [
			'@drizzle-team/brocli',
			'@ewoudenberg/difflib',
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
			'chalk',
			'dotenv/config',
			'camelcase',
			'semver',
			'env-paths',
			'@js-temporal/polyfill',
			'ohm-js',
		],
		entry: 'src/cli/index.ts',
		logger: true,
		ignoreTypes: true,
	}).issues;

	console.log();
	for (const issue of issues) {
		console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
	}

	assert.equal(issues.length, 0);
});

// test('imports-issues2', () => {
// 	const issues = analyzeImports({
// 		basePath: '.',
// 		localPaths: ['src'],
// 		whiteList: [
// 			'zod',
// 			// 'hanji',
// 			// 'chalk',
// 			// '@ewoudenberg/difflib',
// 		],
// 		entry: 'src/utils/studio.ts',
// 		logger: true,
// 		ignoreTypes: true,
// 	}).issues;

// 	console.log();
// 	for (const issue of issues) {
// 		console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
// 		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
// 	}

// 	assert.equal(issues.length, 0);
// });

test('check imports sqlite-studio', () => {
	const issues = analyzeImports({
		basePath: '.',
		localPaths: ['src'],
		whiteList: [],
		entry: 'src/ext/studio-sqlite.ts',
		logger: true,
		ignoreTypes: true,
	}).issues;

	console.log();
	for (const issue of issues) {
		console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
	}

	assert.equal(issues.length, 0);
});

test('check imports postgres-studio', () => {
	const issues = analyzeImports({
		basePath: '.',
		localPaths: ['src'],
		whiteList: ['camelcase', 'ohm-js', '@js-temporal/polyfill'],
		entry: 'src/ext/studio-postgres.ts',
		logger: true,
		ignoreTypes: true,
	}).issues;

	console.log();
	for (const issue of issues) {
		console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
	}

	assert.equal(issues.length, 0);
});

test('check imports postgres-mover', () => {
	const issues = analyzeImports({
		basePath: '.',
		localPaths: ['src'],
		whiteList: ['camelcase', 'ohm-js', '@js-temporal/polyfill'],
		entry: 'src/ext/mover-postgres.ts',
		logger: true,
		ignoreTypes: true,
	}).issues;

	console.log();
	for (const issue of issues) {
		console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
	}

	assert.equal(issues.length, 0);
});

test('check imports mysql-mover', () => {
	const issues = analyzeImports({
		basePath: '.',
		localPaths: ['src'],
		whiteList: [],
		entry: 'src/ext/mover-mysql.ts',
		logger: true,
		ignoreTypes: true,
	}).issues;

	console.log();
	for (const issue of issues) {
		console.log(chalk.red(issue.imports.map((it) => it.name).join('\n')));
		console.log(issue.accessChains.map((it) => chainToString(it)).join('\n'));
	}

	assert.equal(issues.length, 0);
});
