import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Fixture conventions: fixtures/golden/<name>/input.ts + expected.sql, fixtures/errors/<name>/input.ts + expected.txt.
 * Re-record with UPDATE_GOLDEN=1; a missing snapshot fails instead of being recorded silently.
 */
export const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1' || process.env.UPDATE_GOLDEN === 'true';

export function fixtureDirs(kind: 'golden' | 'errors'): { name: string; dir: string; input: string }[] {
	const root = path.join(FIXTURES_DIR, kind);
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => ({ name: e.name, dir: path.join(root, e.name), input: path.join(root, e.name, 'input.ts') }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The expected snapshot, or null when it was (re)recorded. */
export function readOrUpdateSnapshot(snapshotPath: string, actual: string): string | null {
	if (UPDATE_GOLDEN) {
		fs.writeFileSync(snapshotPath, actual);
		return null;
	}
	if (!fs.existsSync(snapshotPath)) {
		throw new Error(
			`missing snapshot: ${snapshotPath}\nrecord it with UPDATE_GOLDEN=1, then review it\n--- actual ---\n${actual}`,
		);
	}
	return fs.readFileSync(snapshotPath, 'utf8');
}

/** Whitespace-insensitive SQL comparison form. */
export function normalizeSql(sql: string): string {
	return sql.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '').join('\n').trim();
}
