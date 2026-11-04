import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { beforeAll, describe, expect, test } from 'vitest';

const distIndexPath = resolve(process.cwd(), 'dist', 'index.js');
const skipDistTests = process.env.DRIZZLE_KIT_SKIP_DIST_TESTS === '1';

describe('Importing drizzle-kit adds zero process.env keys (no dotenv side effect)', () => {
	beforeAll(() => {
		// CI must always build the dist bundle before running these regressions. Local
		// developers iterating on src/ can opt out of dist-backed tests via the env var.
		if (!skipDistTests && !existsSync(distIndexPath)) {
			throw new Error(
				`no-dotenv regression requires dist/index.js at ${distIndexPath}. Run \`pnpm --filter drizzle-kit build\` first, `
					+ `or set DRIZZLE_KIT_SKIP_DIST_TESTS=1 to opt out locally.`,
			);
		}
	});

	test.skipIf(skipDistTests)(
		"import('drizzle-kit') from a clean child process produces zero env-key delta",
		() => {
			const probeDir = resolve(tmpdir(), 'drizzle-kit-no-dotenv-probe');
			mkdirSync(probeDir, { recursive: true });
			const envFile = resolve(probeDir, '.env');
			writeFileSync(envFile, 'NO_DOTENV_TEST_CANARY=1\nNO_DOTENV_TEST_CANARY_2=2\n');

			try {
				const probeScript = `
const before = new Set(Object.keys(process.env));
import(${JSON.stringify(distIndexPath)}).then(() => {
  const after = new Set(Object.keys(process.env));
  const added = [...after].filter(k => !before.has(k));
  process.stdout.write(JSON.stringify({ added }));
}).catch(e => { console.error(e); process.exit(1); });
`;

				const result = spawnSync('node', ['--input-type=module', '--eval', probeScript], {
					cwd: probeDir,
					encoding: 'utf8',
					env: { ...process.env },
				});

				if (result.status !== 0) {
					// eslint-disable-next-line no-console
					console.error('Probe stderr:', result.stderr);
				}
				expect(result.status).toBe(0);

				const payload = JSON.parse(result.stdout.trim());
				expect(payload.added).toEqual([]);
				expect(payload.added).not.toContain('NO_DOTENV_TEST_CANARY');
				expect(payload.added).not.toContain('NO_DOTENV_TEST_CANARY_2');
			} finally {
				rmSync(probeDir, { recursive: true, force: true });
			}
		},
	);
});
