import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, test } from 'vitest';
import { migrateToFoldersV3 } from 'src/cli/commands/utils';

// https://github.com/drizzle-team/drizzle-orm/issues/6166
// Converting a v0 migrations folder is destructive: each entry's original .sql
// is deleted as it moves. A journal entry whose snapshot is missing used to be
// discovered only mid-loop, after earlier entries were already converted and
// their originals deleted - leaving the folder half-converted and the `up`
// command non-resumable. The conversion must validate everything up-front.

const makeV0Folder = (withSecondSnapshot: boolean) => {
	const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-up-'));
	mkdirSync(join(out, 'meta'));
	writeFileSync(
		join(out, 'meta/_journal.json'),
		JSON.stringify({
			version: '5',
			dialect: 'sqlite',
			entries: [
				{ idx: 0, version: '5', when: 1700000000000, tag: '0000_init', breakpoints: true },
				{ idx: 1, version: '5', when: 1700000001000, tag: '0001_add_users', breakpoints: true },
			],
		}),
	);
	writeFileSync(join(out, 'meta/0000_snapshot.json'), '{"id":"0000"}');
	if (withSecondSnapshot) {
		writeFileSync(join(out, 'meta/0001_snapshot.json'), '{"id":"0001"}');
	}
	writeFileSync(join(out, '0000_init.sql'), 'CREATE TABLE users (id integer);');
	writeFileSync(join(out, '0001_add_users.sql'), 'ALTER TABLE users ADD name text;');
	return out;
};

test('missing snapshot aborts before any conversion happens', () => {
	const out = makeV0Folder(false);

	expect(() => migrateToFoldersV3(out)).toThrowError(/No snapshot was found/);

	// Nothing may be converted: originals intact, no new folders, meta untouched.
	expect(existsSync(join(out, '0000_init.sql'))).toBe(true);
	expect(existsSync(join(out, '0001_add_users.sql'))).toBe(true);
	expect(existsSync(join(out, 'meta/_journal.json'))).toBe(true);
	expect(existsSync(join(out, 'meta/0000_snapshot.json'))).toBe(true);
	const dirs = readdirSync(out).filter((it) =>
		existsSync(join(out, it)) && !it.endsWith('.sql')
	);
	expect(dirs).toStrictEqual(['meta']);
});

test('a complete folder still converts fully', () => {
	const out = makeV0Folder(true);

	expect(migrateToFoldersV3(out)).toBe(true);

	expect(existsSync(join(out, 'meta'))).toBe(false);
	expect(existsSync(join(out, '0000_init.sql'))).toBe(false);
	expect(existsSync(join(out, '0001_add_users.sql'))).toBe(false);
});