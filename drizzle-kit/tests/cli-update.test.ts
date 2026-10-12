import { test as brotest } from '@drizzle-team/brocli';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { afterEach, assert, beforeEach, describe, expect, test } from 'vitest';
import { update } from '../src/cli/schema';
import {
	detectPackageManager,
	getInstallCommand,
	getLatestVersion,
	updatePackageInJson,
} from '../src/cli/commands/update';

describe('update command parsing', () => {
	test('update - no flags', async () => {
		const res = await brotest(update, '');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options).toStrictEqual({
			beta: false,
			kitBeta: false,
			ormBeta: false,
			dryRun: false,
			skipInstall: false,
		});
	});

	test('update - beta flag', async () => {
		const res = await brotest(update, '--beta');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options.beta).toBe(true);
	});

	test('update - kit-beta flag', async () => {
		const res = await brotest(update, '--kit-beta');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options.kitBeta).toBe(true);
	});

	test('update - orm-beta flag', async () => {
		const res = await brotest(update, '--orm-beta');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options.ormBeta).toBe(true);
	});

	test('update - dry-run flag', async () => {
		const res = await brotest(update, '--dry-run');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options.dryRun).toBe(true);
	});

	test('update - skip-install flag', async () => {
		const res = await brotest(update, '--skip-install');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options.skipInstall).toBe(true);
	});

	test('update - multiple flags', async () => {
		const res = await brotest(update, '--beta --dry-run --skip-install');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options).toStrictEqual({
			beta: true,
			kitBeta: false,
			ormBeta: false,
			dryRun: true,
			skipInstall: true,
		});
	});
});

describe('getLatestVersion', () => {
	test('returns latest when useBeta is false', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
				beta: '0.36.0-beta.1',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, false);
		expect(version).toBe('0.35.0');
	});

	test('returns beta when useBeta is true and beta exists', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
				beta: '0.36.0-beta.1',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, true);
		expect(version).toBe('0.36.0-beta.1');
	});

	test('returns next when useBeta is true and only next exists', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
				next: '0.36.0-next.1',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, true);
		expect(version).toBe('0.36.0-next.1');
	});

	test('returns latest when useBeta is true but no beta/next/rc exists', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, true);
		expect(version).toBe('0.35.0');
	});

	test('returns rc when useBeta is true and only rc exists', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
				rc: '0.36.0-rc.1',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, true);
		expect(version).toBe('0.36.0-rc.1');
	});

	test('prefers beta over next when both exist', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
				beta: '0.36.0-beta.1',
				next: '0.36.0-next.2',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, true);
		expect(version).toBe('0.36.0-beta.1');
	});

	test('prefers next over rc when both exist', () => {
		const packageInfo = {
			'dist-tags': {
				latest: '0.35.0',
				next: '0.36.0-next.1',
				rc: '0.36.0-rc.1',
			},
			versions: {},
		};
		const version = getLatestVersion(packageInfo, true);
		expect(version).toBe('0.36.0-next.1');
	});
});

describe('updatePackageInJson', () => {
	test('updates version in dependencies with caret prefix', () => {
		const packageJson = {
			dependencies: {
				'drizzle-orm': '^0.30.0',
			},
		};
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).not.toBeNull();
		expect(result?.to).toBe('^0.35.0');
		expect(result?.from).toBe('^0.30.0');
		expect(result?.location).toBe('dependencies');
		expect((packageJson.dependencies as Record<string, string>)['drizzle-orm']).toBe('^0.35.0');
	});

	test('updates version in devDependencies with tilde prefix', () => {
		const packageJson = {
			devDependencies: {
				'drizzle-kit': '~0.25.0',
			},
		};
		const result = updatePackageInJson(packageJson, 'drizzle-kit', '0.31.0');
		expect(result).not.toBeNull();
		expect(result?.to).toBe('~0.31.0');
		expect(result?.location).toBe('devDependencies');
	});

	test('updates version without prefix', () => {
		const packageJson = {
			dependencies: {
				'drizzle-orm': '0.30.0',
			},
		};
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).not.toBeNull();
		expect(result?.to).toBe('0.35.0');
	});

	test('returns null when already up to date', () => {
		const packageJson = {
			dependencies: {
				'drizzle-orm': '^0.35.0',
			},
		};
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('returns null when package not found', () => {
		const packageJson = {
			dependencies: {
				'other-package': '^1.0.0',
			},
		};
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('prefers dependencies over devDependencies', () => {
		const packageJson = {
			dependencies: {
				'drizzle-orm': '^0.30.0',
			},
			devDependencies: {
				'drizzle-orm': '^0.28.0',
			},
		};
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result?.location).toBe('dependencies');
	});

	test('returns null for workspace protocol versions', () => {
		const packageJson = { dependencies: { 'drizzle-orm': 'workspace:*' } };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('returns null for workspace:^ versions', () => {
		const packageJson = { dependencies: { 'drizzle-orm': 'workspace:^' } };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('returns null for git URL versions', () => {
		const packageJson = { dependencies: { 'drizzle-orm': 'github:drizzle-team/drizzle-orm' } };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('returns null for file: protocol versions', () => {
		const packageJson = { dependencies: { 'drizzle-orm': 'file:../local-package' } };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('returns null when current version is newer than target', () => {
		const packageJson = { dependencies: { 'drizzle-orm': '^0.40.0' } };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('handles empty dependencies object', () => {
		const packageJson = { dependencies: {} };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});

	test('handles missing dependencies and devDependencies', () => {
		const packageJson = { name: 'test-package' };
		const result = updatePackageInJson(packageJson, 'drizzle-orm', '0.35.0');
		expect(result).toBeNull();
	});
});

describe('getInstallCommand', () => {
	test('returns correct command for npm', () => {
		expect(getInstallCommand('npm')).toBe('npm install');
	});

	test('returns correct command for pnpm', () => {
		expect(getInstallCommand('pnpm')).toBe('pnpm install');
	});

	test('returns correct command for yarn', () => {
		expect(getInstallCommand('yarn')).toBe('yarn install');
	});

	test('returns correct command for bun', () => {
		expect(getInstallCommand('bun')).toBe('bun install');
	});
});

describe('detectPackageManager', () => {
	const testDir = 'tests/tmp-pm-detect';
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
	});

	test('detects pnpm from pnpm-lock.yaml', () => {
		writeFileSync('pnpm-lock.yaml', '');
		expect(detectPackageManager()).toBe('pnpm');
	});

	test('detects yarn from yarn.lock', () => {
		writeFileSync('yarn.lock', '');
		expect(detectPackageManager()).toBe('yarn');
	});

	test('detects bun from bun.lockb', () => {
		writeFileSync('bun.lockb', '');
		expect(detectPackageManager()).toBe('bun');
	});

	test('defaults to npm when no lockfile exists', () => {
		expect(detectPackageManager()).toBe('npm');
	});

	test('prefers pnpm when multiple lockfiles exist', () => {
		writeFileSync('pnpm-lock.yaml', '');
		writeFileSync('yarn.lock', '');
		expect(detectPackageManager()).toBe('pnpm');
	});
});
