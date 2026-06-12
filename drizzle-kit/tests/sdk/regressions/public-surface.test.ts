import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, describe, expect, test } from 'vitest';

const distCjsPath = resolve(process.cwd(), 'dist', 'index.js');
const distMjsPath = resolve(process.cwd(), 'dist', 'index.mjs');
const skipDistTests = process.env.DRIZZLE_KIT_SKIP_DIST_TESTS === '1';

describe("drizzle-kit public surface exports exactly ['check','defineConfig','generate','push']", () => {
	beforeAll(() => {
		if (!skipDistTests && !existsSync(distCjsPath)) {
			throw new Error(
				`public-surface regression requires dist/index.js at ${distCjsPath}. Run \`pnpm --filter drizzle-kit build\` first, `
					+ `or set DRIZZLE_KIT_SKIP_DIST_TESTS=1 to opt out locally.`,
			);
		}
	});

	test.skipIf(skipDistTests)(
		"Object.keys(require('drizzle-kit')) returns exactly ['check','defineConfig','generate','push']",
		() => {
			const probeScript = `
const m = require(${JSON.stringify(distCjsPath)});
const keys = Object.keys(m).filter(k => !k.startsWith('__')).sort();
process.stdout.write(JSON.stringify({ keys }));
`;
			const result = spawnSync('node', ['--eval', probeScript], {
				cwd: process.cwd(),
				encoding: 'utf8',
				env: { ...process.env },
			});

			expect(result.status).toBe(0);
			const payload = JSON.parse(result.stdout.trim());
			expect(payload.keys).toEqual(['check', 'defineConfig', 'generate', 'push']);
		},
	);

	test.skipIf(skipDistTests)(
		"ESM dist/index.mjs exports ['check','defineConfig','generate','push']",
		() => {
			const probeScript = `
import(${JSON.stringify(distMjsPath)}).then((m) => {
  const keys = Object.keys(m).filter(k => !k.startsWith('__') && k !== 'default').sort();
  process.stdout.write(JSON.stringify({ keys }));
}).catch(e => { console.error(e); process.exit(1); });
`;
			const result = spawnSync('node', ['--input-type=module', '--eval', probeScript], {
				cwd: process.cwd(),
				encoding: 'utf8',
				env: { ...process.env },
			});

			expect(result.status).toBe(0);
			const payload = JSON.parse(result.stdout.trim());
			expect(payload.keys).toEqual(['check', 'defineConfig', 'generate', 'push']);
		},
	);
});
