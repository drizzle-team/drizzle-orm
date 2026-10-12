import { PGlite } from '@electric-sql/pglite';
import { spawnSync } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { expect, test } from 'vitest';

test('push exits non-zero and stops at the first failed statement', async () => {
	const tempDir = await mkdtemp(join(tmpdir(), 'drizzle-kit-push-'));
	const databasePath = join(tempDir, 'pglite');

	try {
		const setup = new PGlite(databasePath);
		try {
			await setup.exec('CREATE TABLE "issue_6192" ("id" integer NOT NULL);');
		} finally {
			await setup.close();
		}

		const result = spawnSync(
			process.execPath,
			[
				require.resolve('tsx/cli'),
				resolve('src/cli/index.ts'),
				'push',
				'--config=push-error.config.ts',
				'--force',
				'--verbose',
			],
			{
				cwd: resolve('.'),
				encoding: 'utf8',
				timeout: 60_000,
				env: {
					...process.env,
					TEST_CONFIG_PATH_PREFIX: './tests/cli/',
					PGLITE_DATABASE_PATH: databasePath,
					NO_COLOR: '1',
				},
			},
		);

		if (result.error) throw result.error;

		expect(result.status).toBe(1);
		expect(result.stdout.indexOf('a_fails')).toBeGreaterThanOrEqual(0);
		expect(result.stdout.indexOf('z_after_failure')).toBeGreaterThan(result.stdout.indexOf('a_fails'));
		expect(result.stdout).not.toContain('Changes applied');

		const verify = new PGlite(databasePath);
		try {
			const { rows } = await verify.query<{ conname: string }>(
				`select conname from pg_constraint where conrelid = 'issue_6192'::regclass`,
			);
			expect(rows.map(({ conname }) => conname)).not.toContain('z_after_failure');
		} finally {
			await verify.close();
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
