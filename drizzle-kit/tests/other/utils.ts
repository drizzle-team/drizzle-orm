import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Config, DialectDriverMap } from 'src';
import type { Dialect } from 'src/utils/schemaValidator';

export function createConfig<
	TDialect extends Dialect,
	TDriver extends DialectDriverMap[TDialect] = 'default',
>(
	config: Config<TDialect, TDriver>,
	pathPrefix: string,
): { path: string; name: string } {
	const name = `drizzle.${randomBytes(8).toString('hex')}.config.ts`;
	const path = join(process.cwd(), pathPrefix, name);
	const body = `import { defineConfig } from '../../src';\n\nexport default defineConfig(${
		JSON.stringify(config, null, 2)
	});\n`;

	writeFileSync(path, body);
	return { path, name };
}
