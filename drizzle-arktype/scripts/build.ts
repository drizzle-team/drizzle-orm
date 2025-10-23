import { $, Glob } from 'bun';
import { rm } from 'fs/promises';
import { availableParallelism, FixedThreadPool } from 'poolifier-web-worker';

await rm('dist', { recursive: true, force: true });
await $`rolldown --config rolldown.config.ts`;
await $`resolve-tspaths`;
await Bun.write('dist/README.md', Bun.file('README.md'));

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
const pool = new FixedThreadPool<{
	name: string;
	content: string;
	extension: string;
}, {
	name: string;
	code: string;
}>(
	availableParallelism(),
	new URL('./build.worker.ts', import.meta.url),
	{
		errorEventHandler: (err) => {
			console.error('Worker error:', err);
			process.exit(1);
		},
	},
);

const cjsFilesCodePromise = pool.mapExecute(
	cjsFiles.map(({ content, name }) => ({ content, name, extension: '.cjs' })),
);
const jsFilesCodePromise = pool.mapExecute(jsFiles.map(({ content, name }) => ({ content, name, extension: '.js' })));
const mjsFilesCodePromise = pool.mapExecute(
	mjsFiles.map(({ content, name }) => ({ content, name, extension: '.mjs' })),
);
const [cjsFilesCode, jsFilesCode, mjsFilesCode] = await Promise.all([
	cjsFilesCodePromise,
	jsFilesCodePromise,
	mjsFilesCodePromise,
]);
await pool.destroy();

await Promise.all(
	[
		...cjsFilesCode,
		...jsFilesCode,
		...mjsFilesCode,
	].map(async ({ code, name }) => await Bun.write(name, code)),
);
