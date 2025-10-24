import { $, Glob } from 'bun';
import { rm } from 'fs/promises';
import { availableParallelism, FixedThreadPool } from 'poolifier-web-worker';

console.time('build');
await rm('dist', { recursive: true, force: true });
await $`rolldown --config rolldown.config.ts`;
await $`resolve-tspaths`;
await Bun.write('dist/README.md', Bun.file('../README.md'));

const declarationFilesGlob = new Glob('**/*.d.mts');
for await (const file of declarationFilesGlob.scan('./dist')) {
	const newFileName1 = file.replace(/\.d\.mts$/, '.d.ts');
	const newFileName2 = file.replace(/\.d\.mts$/, '.d.cts');
	await Promise.all([
		Bun.write(`dist/${newFileName1}`, Bun.file(`dist/${file}`)),
		Bun.write(`dist/${newFileName2}`, Bun.file(`dist/${file}`)),
	]);
}

await Bun.write('dist/package.json', Bun.file('package.json'));

async function getFilesFromGlob(pattern: string) {
	const files = await Array.fromAsync(new Glob(pattern).scan('./dist'));
	return await Promise.all(files.map(async (file) => ({
		content: await Bun.file(`dist/${file}`).text(),
		name: `dist/${file}`,
	})));
}

const [cjsFiles, jsFiles, mjsFiles] = await Promise.all([
	getFilesFromGlob('**/*.{cjs,d.cts}'),
	getFilesFromGlob('**/*.{js,d.ts}'),
	getFilesFromGlob('**/*.{mjs,d.mts}'),
]);
const parallelism = availableParallelism();
const pool = new FixedThreadPool<{
	name: string;
	content: string;
	extension: string;
}[], {
	name: string;
	code: string;
}[]>(
	parallelism,
	new URL('./build.worker.ts', import.meta.url),
	{
		errorEventHandler: (err) => {
			console.error('Worker error:', err);
			process.exit(1);
		},
	},
);

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
const allFiles = splitArray([
	...cjsFiles.map(({ content, name }) => ({ content, name, extension: '.cjs' })),
	...jsFiles.map(({ content, name }) => ({ content, name, extension: '.js' })),
	...mjsFiles.map(({ content, name }) => ({ content, name, extension: '.mjs' })),
], parallelism);

const writeFiles = await pool.mapExecute(allFiles);
await pool.destroy();

await Promise.all(writeFiles.flat(1).map(async ({ code, name }) => await Bun.write(name, code)));
console.timeEnd('build');
