import { readFile } from 'fs/promises';
import { checkPackage } from './checkPackage.ts';
import { getExitCode } from './cli/getExitCode.ts';
import { typed } from './cli/typed.ts';
import { untyped } from './cli/untyped.ts';
import { write } from './cli/write.ts';
import { createPackageFromTarballData } from './createPackage.ts';
import type { ResolutionKind, UntypedResult } from './types.ts';

try {
	const path = process.argv[2];
	const mode = process.argv[3];
	const modes: Record<ResolutionKind, boolean> | undefined = mode
		? mode === 'node10'
			? {
				node10: true,
				'node16-cjs': false,
				'node16-esm': false,
				bundler: false,
			}
			: mode === 'node16-esm'
			? {
				node10: false,
				'node16-cjs': false,
				'node16-esm': true,
				bundler: false,
			}
			: mode === 'node16-cjs'
			? {
				node10: false,
				'node16-cjs': true,
				'node16-esm': false,
				bundler: false,
			}
			: mode === 'bundler'
			? {
				node10: false,
				'node16-cjs': false,
				'node16-esm': false,
				bundler: true,
			}
			: undefined
		: undefined;

	const ignoreResolutions = modes
		? Object.entries(modes)
			.filter(([, v]) => v === false)
			.map(([k]) => k as ResolutionKind)
		: undefined;

	if (path === undefined) throw new Error('Missing target path');
	if (modes === undefined && mode !== undefined) {
		throw new Error(`Invalid mode: '${mode}'. Allowed modes: 'bundler' | 'node10' | 'node16-cjs' | 'node16-esm'.`);
	}

	const file = await readFile(path);
	const data = new Uint8Array(file);
	const pkg = createPackageFromTarballData(data);

	const analysis = await checkPackage(pkg, {
		modes,
	});

	console.log('Mode:', mode);
	console.log('Ignore:', ignoreResolutions);

	const out = process.stdout;
	await write('', out);
	if (analysis.types) {
		await write(
			await typed(analysis, {
				ignoreResolutions,
			}),
			out,
		);
		process.exitCode = getExitCode(analysis, {
			ignoreResolutions,
		});
	} else {
		await write(untyped(analysis as UntypedResult), out);
	}
} catch (error) {
	console.error(error);
	if (error && typeof error === 'object' && 'message' in error) {
		console.error(`Error while checking package:\n${error.message}`);
	} else {
		console.error(`Unknown error while checking package:\n${error}`);
	}

	process.exit(3);
}
