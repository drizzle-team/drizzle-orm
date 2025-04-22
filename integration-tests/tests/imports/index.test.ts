import { afterAll, expect, it } from 'vitest';
import 'zx/globals';
import * as fs from 'fs';
import path from 'path';

$.verbose = false;

const IMPORTS_FOLDER = 'tests/imports/files';

const folderPath = '../drizzle-orm/dist/package.json';
const pj = JSON.parse(fs.readFileSync(folderPath, 'utf8'));

if (!fs.existsSync(IMPORTS_FOLDER)) {
	fs.mkdirSync(IMPORTS_FOLDER);
}

it('dynamic imports check for CommonJS', async () => {
	const promises: ProcessPromise[] = [];
	for (const [i, key] of Object.keys(pj['exports']).entries()) {
		const o1 = path.join('drizzle-orm', key);
		if (
			o1.startsWith('drizzle-orm/bun-sqlite') || o1.startsWith('drizzle-orm/pglite')
			|| o1.startsWith('drizzle-orm/expo-sqlite') || o1.startsWith('drizzle-orm/libsql/wasm')
			|| o1.startsWith('drizzle-orm/bun-sql')
		) {
			continue;
		}
		fs.writeFileSync(`${IMPORTS_FOLDER}/imports_${i}.cjs`, 'requ');
		fs.appendFileSync(`${IMPORTS_FOLDER}/imports_${i}.cjs`, 'ire("' + o1 + '");\n', {});

		// fs.writeFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'imp');
		// fs.appendFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'ort "' + o1 + '"\n', {});

		promises.push(
			$`node ${IMPORTS_FOLDER}/imports_${i}.cjs`.nothrow(),
			// $`node ${IMPORTS_FOLDER}/imports_${i}.mjs`.nothrow(),
		);
	}
	const results = await Promise.all(promises);

	for (const result of results) {
		expect(result.exitCode, result.message).toBe(0);
	}
});

it('dynamic imports check for ESM', async () => {
	const promises: ProcessPromise[] = [];
	for (const [i, key] of Object.keys(pj['exports']).entries()) {
		const o1 = path.join('drizzle-orm', key);
		if (
			o1.startsWith('drizzle-orm/bun-sqlite') || o1.startsWith('drizzle-orm/expo-sqlite')
			|| o1.startsWith('drizzle-orm/bun-sql')
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

	const results = await Promise.all(promises);

	for (const result of results) {
		expect(result.exitCode, result.message).toBe(0);
	}
});

afterAll(() => {
	fs.rmdirSync(IMPORTS_FOLDER, { recursive: true });
});
