import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

test('json version output uses root special case payload', () => {
	const script = [
		'(async () => {',
		"process.argv = ['node','drizzle-kit','--json','--version'];",
		"await import('./src/cli/index.ts');",
		'})().catch((err) => {',
		'console.error(err);',
		'process.exit(1);',
		'});',
	].join(' ');

	const result = spawnSync('pnpm', ['exec', 'tsx', '-e', script], {
		cwd: process.cwd(),
		encoding: 'utf8',
	});

	expect(result.status).not.toBeNull();
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toHaveProperty('kitVersion');
	expect(parsed).toHaveProperty('ormVersion');
});

test('json error output includes structured cli error fields', () => {
	const script = [
		'(async () => {',
		"process.argv = ['node','drizzle-kit','up','--json','--config=foo.ts','--dialect=postgresql'];",
		"await import('./src/cli/index.ts');",
		'})().catch((err) => {',
		'console.error(err);',
		'process.exit(1);',
		'});',
	].join(' ');

	const result = spawnSync('pnpm', ['exec', 'tsx', '-e', script], {
		cwd: process.cwd(),
		encoding: 'utf8',
	});

	expect(result.status).not.toBeNull();
	expect(result.stderr).toContain("You can't use both --config and other cli options for check command");
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toStrictEqual({
		status: 'error',
		error: {
			code: 'ambiguous_params_error',
			command: 'check',
			configOption: 'config',
		},
	});
});

test('up handler emits json summary and upgrades snapshot files', async () => {
	vi.doMock('../../src/cli/utils', async () => {
		const actual = await vi.importActual<typeof import('../../src/cli/utils')>('../../src/cli/utils');
		return {
			...actual,
			assertOrmCoreVersion: vi.fn(async () => {}),
			assertPackages: vi.fn(async () => {}),
		};
	});

	const { setJsonMode } = await import('../../src/cli/mode');
	const { up } = await import('../../src/cli/schema');
	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-up-json-'));
	const migrationDir = join(tempDir, '1700000000000_init');
	mkdirSync(migrationDir, { recursive: true });

	const fixturePath = join(process.cwd(), 'tests/postgres/snapshots/snapshot05-0.23.2.json');
	const snapshotTarget = join(migrationDir, 'snapshot.json');
	writeFileSync(snapshotTarget, readFileSync(fixturePath, 'utf8'));

	const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const originalCwd = process.cwd();
	setJsonMode(true);

	process.chdir(tempDir);
	try {
		await up.handler?.({ out: '.', dialect: 'postgresql' });
	} finally {
		process.chdir(originalCwd);
	}

	const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(output);
	const upgradedSnapshot = JSON.parse(readFileSync(snapshotTarget, 'utf8'));

	expect(parsed).toStrictEqual({
		status: 'ok',
		upgradedFiles: ['1700000000000_init/snapshot.json'],
	});
	expect(upgradedSnapshot.version).toBe('8');
	expect(upgradedSnapshot.dialect).toBe('postgres');
});
