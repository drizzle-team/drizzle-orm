import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { applyEnvFiles, extractEnvFiles } from '../src/cli/env-loader';

describe('extractEnvFiles', () => {
	test('parses --env-file=<path>', () => {
		const { paths, remaining } = extractEnvFiles([
			'migrate',
			'--env-file=.env.local',
			'--config=drizzle.config.ts',
		]);
		expect(paths).toEqual(['.env.local']);
		expect(remaining).toEqual(['migrate', '--config=drizzle.config.ts']);
	});

	test('parses --env-file <path> (space-separated)', () => {
		const { paths, remaining } = extractEnvFiles([
			'migrate',
			'--env-file',
			'.env.local',
		]);
		expect(paths).toEqual(['.env.local']);
		expect(remaining).toEqual(['migrate']);
	});

	test('parses short -e alias both forms', () => {
		const { paths, remaining } = extractEnvFiles([
			'migrate',
			'-e=.env.a',
			'-e',
			'.env.b',
		]);
		expect(paths).toEqual(['.env.a', '.env.b']);
		expect(remaining).toEqual(['migrate']);
	});

	test('preserves order of multiple --env-file flags', () => {
		const { paths } = extractEnvFiles([
			'--env-file=.env.shared',
			'migrate',
			'--env-file=.env.local',
		]);
		expect(paths).toEqual(['.env.shared', '.env.local']);
	});

	test('returns empty paths when no --env-file present', () => {
		const { paths, remaining } = extractEnvFiles(['migrate', '--config=x.ts']);
		expect(paths).toEqual([]);
		expect(remaining).toEqual(['migrate', '--config=x.ts']);
	});
});

describe('applyEnvFiles', () => {
	let tmp: string;
	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), 'drizzle-kit-env-'));
	});
	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	const write = (name: string, body: string): string => {
		const p = join(tmp, name);
		writeFileSync(p, body);
		return p;
	};

	test('loads variables from a single .env file', () => {
		const path = write('.env', 'DATABASE_URL=postgres://from-env-file/db\n');
		const env: NodeJS.ProcessEnv = {};
		applyEnvFiles([path], env);
		expect(env.DATABASE_URL).toBe('postgres://from-env-file/db');
	});

	test('does not overwrite pre-existing (shell) env vars', () => {
		const path = write('.env', 'DATABASE_URL=postgres://from-env-file/db\n');
		const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgres://from-shell/db' };
		applyEnvFiles([path], env);
		expect(env.DATABASE_URL).toBe('postgres://from-shell/db');
	});

	test('later --env-file overrides earlier --env-file for the same key', () => {
		const a = write('.env.a', 'DATABASE_URL=postgres://a/db\nA_ONLY=1\n');
		const b = write('.env.b', 'DATABASE_URL=postgres://b/db\nB_ONLY=2\n');
		const env: NodeJS.ProcessEnv = {};
		applyEnvFiles([a, b], env);
		expect(env.DATABASE_URL).toBe('postgres://b/db');
		expect(env.A_ONLY).toBe('1');
		expect(env.B_ONLY).toBe('2');
	});

	test('shell var still wins over multiple --env-file overrides', () => {
		const a = write('.env.a', 'DATABASE_URL=postgres://a/db\n');
		const b = write('.env.b', 'DATABASE_URL=postgres://b/db\n');
		const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgres://shell/db' };
		applyEnvFiles([a, b], env);
		expect(env.DATABASE_URL).toBe('postgres://shell/db');
	});
});
