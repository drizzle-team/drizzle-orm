import fs from 'fs';
import * as glob from 'glob';
import Path from 'path';
import { error } from '../cli/views';

export const prepareFilenames = (path: string | string[]) => {
	if (typeof path === 'string') {
		path = [path];
	}
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const result = path.reduce((result, cur) => {
		const globbed = glob.sync(`${prefix}${cur}`);

		globbed.forEach((it) => {
			const fileName = fs.lstatSync(it).isDirectory() ? null : Path.resolve(it);

			const filenames = fileName
				? [fileName!]
				: fs.readdirSync(it).map((file) => Path.join(Path.resolve(it), file));

			filenames
				.filter((file) => !fs.lstatSync(file).isDirectory())
				.forEach((file) => result.add(file));
		});

		return result;
	}, new Set<string>());
	const res = [...result];

	// TODO: properly handle and test
	const errors = res.filter((it) => {
		return !(
			it.endsWith('.ts')
			|| it.endsWith('.js')
			|| it.endsWith('.cjs')
			|| it.endsWith('.mjs')
			|| it.endsWith('.mts')
			|| it.endsWith('.cts')
		);
	});

	// when schema: "./schema" and not "./schema.ts"
	if (res.length === 0) {
		console.log(
			error(
				`No schema files found for path config [${
					path
						.map((it) => `'${it}'`)
						.join(', ')
				}]`,
			),
		);
		console.log(
			error(
				`If path represents a file - please make sure to use .ts or other extension in the path`,
			),
		);
		process.exit(1);
	}

	return res;
};
