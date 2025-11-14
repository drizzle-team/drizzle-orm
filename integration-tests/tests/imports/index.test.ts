import { afterAll, expect, it } from 'vitest';
import 'zx/globals';
import * as fs from 'fs';
import path from 'path';
$.verbose = false;

const IMPORTS_FOLDER = 'tests/imports/files';

const folderPath = '../drizzle-orm/dist/package.json';
const pj = JSON.parse(fs.readFileSync(folderPath, 'utf8'));

fs.mkdirSync(IMPORTS_FOLDER, { recursive: true });

afterAll(() => {
	fs.rmdirSync(IMPORTS_FOLDER, { recursive: true });
});

function chunk<T>(arr: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size));
	}
	return chunks;
}

const promisesCJS: ProcessPromise[] = [];
for (const [i, key] of Object.keys(pj['exports']).entries()) {
	const o1 = path.join('drizzle-orm', key);
	if (
		o1.startsWith('drizzle-orm/bun-sqlite') || o1.startsWith('drizzle-orm/pglite')
		|| o1.startsWith('drizzle-orm/expo-sqlite') || o1.startsWith('drizzle-orm/libsql/wasm')
		|| o1.startsWith('drizzle-orm/bun-sql') || o1.startsWith('drizzle-orm/tursodatabase/wasm')
		|| o1.startsWith('drizzle-orm/prisma')
	) {
		continue;
	}
	fs.writeFileSync(`${IMPORTS_FOLDER}/imports_${i}.cjs`, 'requ');
	fs.appendFileSync(`${IMPORTS_FOLDER}/imports_${i}.cjs`, 'ire("' + o1 + '");\n', {});

	// fs.writeFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'imp');
	// fs.appendFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'ort "' + o1 + '"\n', {});

	promisesCJS.push(
		$`node ${IMPORTS_FOLDER}/imports_${i}.cjs`.nothrow(),
		// $`node ${IMPORTS_FOLDER}/imports_${i}.mjs`.nothrow(),
	);
}

const chunksCJS = chunk(promisesCJS, 20);

for (const c of chunksCJS) {
	it.concurrent('dynamic imports check for CommonJS chunk', async () => {
		const results = await Promise.all(c);

		for (const result of results) {
			expect(result.exitCode, result.message).toBe(0);
		}
	});
}

const promises: ProcessPromise[] = [];
for (const [i, key] of Object.keys(pj['exports']).entries()) {
	const o1 = path.join('drizzle-orm', key);
	if (
		o1.startsWith('drizzle-orm/bun-sqlite') || o1.startsWith('drizzle-orm/expo-sqlite')
		|| o1.startsWith('drizzle-orm/bun-sql') || o1.startsWith('drizzle-orm/tursodatabase/wasm')
		|| o1.startsWith('drizzle-orm/prisma')
	) {
		continue;
	}
	fs.writeFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'imp');
	fs.appendFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'ort "' + o1 + '"\n', {});
	promises.push(
		$`node ${IMPORTS_FOLDER}/imports_${i}.mjs`.nothrow(),
		$`node --import import-in-the-middle/hook.mjs ${IMPORTS_FOLDER}/imports_${i}.mjs`.nothrow(),
	);
}

const chunksESM = chunk(promises, 20);

for (const c of chunksESM) {
	it.concurrent('dynamic imports check for ESM chunk', async () => {
		const results = await Promise.all(c);

		for (const result of results) {
			expect(result.exitCode, result.message).toBe(0);
		}
	});
}
