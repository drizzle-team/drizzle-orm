import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Config } from 'src';

export function createConfig(config: Config, pathPrefix: string): { path: string; name: string } {
	const name = `drizzle.${randomBytes(8).toString('hex')}.config.ts`;
	const path = join(process.cwd(), pathPrefix, name);
	const body = `import { defineConfig } from '../../src';\n\nexport default defineConfig(${
		JSON.stringify(config, null, 2)
	});\n`;

	writeFileSync(path, body);
	return { path, name };
}
