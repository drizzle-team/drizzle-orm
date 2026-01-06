/* eslint-disable no-instanceof/no-instanceof */
import fs from 'fs';
import * as childProcess from 'node:child_process';
import { parseDiagOutput, type TSCDiagOutput } from './utils.ts';

export function swapDrizzleVersion(path: string, version: 'beta' | 'current') {
	const [targetLib, desiredLib] = version === 'beta'
		? ['drizzle-orm', 'drizzle-beta']
		: ['drizzle-beta', 'drizzle-orm'];

	const content = fs.readFileSync(path).toString();
	fs.writeFileSync(
		path,
		content.replaceAll(`'${targetLib}'`, `'${desiredLib}'`).replaceAll(`'${targetLib}/`, `'${desiredLib}/`),
	);
}

export function runTsDiagnostics(folder: string, file: string, ormVer: 'beta' | 'current', tsVer: 'latest' | 'next') {
	const targetPath = `./cases/${folder}/${file}.ts`;

	fs.writeFileSync(
		'./tmp.tsconfig.json',
		JSON.stringify({
			extends: './tsconfig.json',
			include: [targetPath],
			exclude: ['./test/*', './lib/*'],
		}),
	);

	swapDrizzleVersion(targetPath, ormVer);

	return childProcess.execSync(
		`pnpm ./node_modules/ts${tsVer}/bin/tsc --diagnostics --incremental false --noEmit true -p ./tmp.tsconfig.json`,
	);
}

export function listTestFiles(folder: string) {
	return fs.readdirSync(`./cases/${folder}`).filter((p) => p.endsWith('.ts')).map((p) => p.slice(0, -3));
}

export function listLibFiles() {
	return fs.readdirSync(`./lib/`).filter((p) => p.endsWith('.ts')).map((p) => p.slice(0, -3));
}

export type DiagnosticsResult = {
	name: string;
	data: TSCDiagOutput;
};

export function bench(folder: string, ormVer: 'beta' | 'current', tsVer: 'latest' | 'next' = 'latest') {
	let baseCase: TSCDiagOutput | undefined;
	const rawCases = [] as DiagnosticsResult[];
	const errCases: string[] = [];

	for (const libName of listLibFiles()) {
		swapDrizzleVersion(`./lib/${libName}.ts`, ormVer);
	}

	for (const name of listTestFiles(folder)) {
		try {
			const raw = runTsDiagnostics(folder, name, ormVer, tsVer);
			const parsed = parseDiagOutput(raw);

			if (name === 'base') {
				baseCase = parsed;
			} else {
				rawCases.push({
					name,
					data: parsed,
				});
			}
		} catch (e) {
			if (typeof e === 'object') {
				console.error(
					(<{ output: (Buffer | undefined)[] }> <any> e).output.filter((e) => !!e).map((e) =>
						`Case: ${name}\nError: ${e.toString()}`
					).join('\n'),
				);
			}

			errCases.push(name);
		}
	}

	if (errCases.length) {
		console.warn(`Errors in case${errCases.length > 1 ? 's' : ''} ${errCases.map((e) => `'${e}'`).join(', ')}`);
	}

	if (!baseCase) throw new Error('Missing baseline case!');

	return [
		{ name: 'baseline', data: baseCase! },
		...rawCases.map((c) => ({
			name: c.name,
			data: Object.fromEntries(
				Object.entries(c.data).map((
					[k, v],
				) => [k, <number> v - baseCase[k as keyof TSCDiagOutput]]),
			) as TSCDiagOutput,
		})) as DiagnosticsResult[],
	];
}
