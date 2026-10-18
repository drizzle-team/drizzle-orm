import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';

const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

test.each([
	{ timestamps: [], invalid: [] },
	{ timestamps: [100], invalid: [] },
	{ timestamps: [100, 200, 300], invalid: [] },
	{ timestamps: [200, 100], invalid: [1] },
	{ timestamps: [100, 100], invalid: [1] },
	{ timestamps: [100, 300, 200, 400], invalid: [2] },
	{ timestamps: [300, 100, 200], invalid: [1, 2] },
	{ timestamps: [300, 200, 100], invalid: [1, 2] },
])('checks journal order for $timestamps', ({ timestamps, invalid }) => {
	const out = mkdtempSync(join(tmpdir(), 'drizzle-check-journal-'));
	folders.push(out);
	mkdirSync(join(out, 'meta'));
	const journalPath = join(out, 'meta', '_journal.json');
	const journal = JSON.stringify({
		version: '7',
		dialect: 'postgresql',
		entries: timestamps.map((when, idx) => ({
			idx,
			tag: `migration_${idx}`,
			when,
			version: '7',
			breakpoints: true,
		})),
	});
	writeFileSync(journalPath, journal);
	const result = runCheck(['--dialect=postgresql', `--out=${out}`]);
	expect(result.status, result.stdout + result.stderr).toBe(0);
	for (let idx = 0; idx < timestamps.length; idx++) {
		const message = `Warning: migration_${idx} (idx: ${idx}, when: ${timestamps[idx]}) follows`;
		if (invalid.includes(idx)) {
			expect(result.stderr).toContain(message);
		} else {
			expect(result.stderr).not.toContain(message);
		}
	}
	if (invalid.length) {
		expect(result.stderr).toContain('If the earlier entry has already been applied');
	}
	expect(result.stdout).toContain("Everything's fine");
	expect(readFileSync(journalPath, 'utf8')).toBe(journal);
});

test('does not connect to the database when credentials are configured', () => {
	const out = mkdtempSync(join(tmpdir(), 'drizzle-check-local-'));
	folders.push(out);
	const config = join(out, 'drizzle.config.json');
	writeFileSync(
		config,
		JSON.stringify({
			dialect: 'postgresql',
			out,
			dbCredentials: { url: 'postgresql://invalid:invalid@127.0.0.1:1/nonexistent' },
		}),
	);
	const result = runCheck([`--config=${config}`]);
	expect(result.status, result.stdout + result.stderr).toBe(0);
	expect(result.stdout).toContain("Everything's fine");
});

const runCheck = (args: string[]) => {
	const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'check', ...args], {
		cwd: resolve(__dirname, '..'),
		env: { ...process.env, TEST_CONFIG_PATH_PREFIX: '' },
		encoding: 'utf8',
		timeout: 10000,
	});
	expect(result.error).toBeUndefined();
	return result;
};
