import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, describe, expect, test } from 'vitest';

const distCjsPath = resolve(process.cwd(), 'dist', 'index.js');
const distMjsPath = resolve(process.cwd(), 'dist', 'index.mjs');
const skipDistTests = process.env.DRIZZLE_KIT_SKIP_DIST_TESTS === '1';
const missingDist = [distCjsPath, distMjsPath].filter((p) => !existsSync(p));
const skipForMissingDist = !skipDistTests && missingDist.length > 0;

if (skipForMissingDist && !process.env.CI) {
	// eslint-disable-next-line no-console
	console.warn(
		`[public-surface] skipping: dist is not built (missing ${missingDist.join(', ')}). `
			+ `Run \`pnpm --filter drizzle-kit build\` to enable this regression, `
			+ `or set DRIZZLE_KIT_SKIP_DIST_TESTS=1 to silence this warning.`,
	);
}

describe("drizzle-kit public surface exports exactly ['defineConfig']", () => {
	beforeAll(() => {
		// Locally a missing dist downgrades to a loud skip; in CI the build step is guaranteed,
		// so a missing dist is a pipeline defect and must fail.
		if (skipForMissingDist && process.env.CI) {
			throw new Error(
				`public-surface regression requires a built dist (missing ${missingDist.join(', ')}). `
					+ `Run \`pnpm --filter drizzle-kit build\` first.`,
			);
		}
	});

	test.skipIf(skipDistTests || skipForMissingDist)(
		"Object.keys(require('drizzle-kit')) returns exactly ['defineConfig']",
		() => {
			const probeScript = `
const m = require(${JSON.stringify(distCjsPath)});
const keys = Object.keys(m).filter(k => !k.startsWith('__') && k !== 'default').sort();
process.stdout.write(JSON.stringify({ keys }));
`;
			const result = spawnSync('node', ['--eval', probeScript], {
				cwd: process.cwd(),
				encoding: 'utf8',
				env: { ...process.env },
			});

			expect(result.status).toBe(0);
			const payload = JSON.parse(result.stdout.trim());
			expect(payload.keys).toEqual(['defineConfig']);
		},
	);

	test.skipIf(skipDistTests || skipForMissingDist)(
		"ESM dist/index.mjs exports ['defineConfig']",
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
			expect(payload.keys).toEqual(['defineConfig']);
		},
	);
});
