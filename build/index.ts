import { $, Glob } from 'bun';
import { rm } from 'fs/promises';
import { availableParallelism, FixedThreadPool } from 'poolifier-web-worker';

export type WorkerIn = {
	name: string;
	content: string;
	extension: string;
}[];

export type WorkerOut = {
	name: string;
	code: string;
}[];

export async function build(config: {
	readme: string;
	skip?: {
		distDelete?: boolean;
		resolveTsPaths?: boolean;
	};
}) {
	if (!config.skip?.distDelete) await rm('dist', { recursive: true, force: true });
	await $`rolldown --config rolldown.config.ts`;
	if (!config.skip?.resolveTsPaths) await $`resolve-tspaths`;
	await Promise.all([
		Bun.write('dist/README.md', Bun.file(config.readme)),
		Bun.write('dist/package.json', Bun.file('package.json')),
	]);

	const declarationFilesGlob = new Glob('**/*.d.mts');
	for await (const file of declarationFilesGlob.scan('./dist')) {
		const newFileName1 = file.replace(/\.d\.mts$/, '.d.ts');
		const newFileName2 = file.replace(/\.d\.mts$/, '.d.cts');
		await Promise.all([
			Bun.write(`dist/${newFileName1}`, Bun.file(`dist/${file}`)),
			Bun.write(`dist/${newFileName2}`, Bun.file(`dist/${file}`)),
		]);
	}

	const [cjsFiles, jsFiles, mjsFiles] = await Promise.all([
		getFilesFromGlob('**/*.{cjs,d.cts}'),
		getFilesFromGlob('**/*.{js,d.ts}'),
		getFilesFromGlob('**/*.{mjs,d.mts}'),
	]);
	const parallelism = availableParallelism();
	const allFiles = splitArray([
		...cjsFiles.map(({ content, name }) => ({ content, name, extension: '.cjs' })),
		...jsFiles.map(({ content, name }) => ({ content, name, extension: '.js' })),
		...mjsFiles.map(({ content, name }) => ({ content, name, extension: '.mjs' })),
	], parallelism);

	const pool = new FixedThreadPool<WorkerIn, WorkerOut>(
		parallelism,
		new URL('./worker.ts', import.meta.url),
		{
			errorEventHandler: (err) => {
				console.error('Worker error:', err);
				process.exit(1);
			},
		},
	);
	const writeFiles = await pool.mapExecute(allFiles);
	await pool.destroy();
	await Promise.all(writeFiles.flat(1).map(async ({ code, name }) => await Bun.write(name, code)));
}

async function getFilesFromGlob(pattern: string) {
	const files = await Array.fromAsync(new Glob(pattern).scan('./dist'));
	return await Promise.all(files.map(async (file) => ({
		content: await Bun.file(`dist/${file}`).text(),
		name: `dist/${file}`,
	})));
}

function splitArray<T>(array: T[], parts: number): T[][] {
	const result: T[][] = [];
	const len = array.length;
	const baseSize = Math.floor(len / parts);
	const remainder = len % parts;

	let start = 0;
	for (let i = 0; i < parts; i++) {
		const extra = i < remainder ? 1 : 0;
		const end = start + baseSize + extra;
		result.push(array.slice(start, end));
		start = end;
	}

	return result;
}
