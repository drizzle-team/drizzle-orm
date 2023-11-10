import { afterAll, expect, it } from 'vitest';
import 'zx/globals';
import * as fs from 'fs';
import path from 'path';

const IMPORTS_FOLDER = 'tests/imports/files';

const folderPath = '../drizzle-orm/dist/package.json';
const pj = JSON.parse(fs.readFileSync(folderPath, 'utf8'));

if (!fs.existsSync(IMPORTS_FOLDER)) {
	fs.mkdirSync(IMPORTS_FOLDER);
}

it('dynamic imports check for cjs and mjs', async () => {
	const promises: ProcessPromise[] = [];
	for (const [i, key] of Object.keys(pj['exports']).entries()) {
		const o1 = path.join('drizzle-orm', key);
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

// it('dynamic imports check for mjs', async () => {
// 	const promises: ProcessPromise[] = [];
// 	for (const [i, key] of Object.keys(pj['exports']).entries()) {
// 		const o1 = path.join('drizzle-orm', key);
// 		fs.writeFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'imp');
// 		fs.appendFileSync(`${IMPORTS_FOLDER}/imports_${i}.mjs`, 'ort "' + o1 + '"\n', {});
// 		promises.push($`node ${IMPORTS_FOLDER}/imports_${i}.mjs`.nothrow());
// 	}

// 	const results = await Promise.all(promises);

// 	for (const result of results) {
// 		expect(result.exitCode, result.message).toBe(0)
// 	}
// });

afterAll(() => {
	fs.rmdirSync(IMPORTS_FOLDER, { recursive: true });
});
