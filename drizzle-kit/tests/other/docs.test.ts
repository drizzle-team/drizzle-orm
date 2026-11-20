import { test as brotest } from '@drizzle-team/brocli';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, assert, beforeAll, expect, test } from 'vitest';
import { docsSearch } from '../../src/cli/schema';
import { writeDocsIndex } from '../../src/docs/build-index';
import { type DocsIndex, formatDocsHits, loadDocsIndex, retrieveDoc, searchDocs } from '../../src/docs/search';

const pgInsert = `---
title: SQL Insert
---
import UpsertNote from '@mdx/UpsertNote.mdx';

<Callout
  type="info"
>
Drizzle inserts rows with \`db.insert()\`.
</Callout>

## Insert one row

\`\`\`ts
# this line is inside a code fence and is not a heading
await db.insert(users).values({ name: 'Andrew' });
\`\`\`

## Upserts and conflicts

<UpsertNote />

### On conflict do nothing

Use \`.onConflictDoNothing()\` to skip a row that conflicts.

#### Target columns

Pass \`target\` to name the conflict columns of the upsert.

## Returning

Use \`.returning()\` to get the inserted rows.
`;

const mysqlInsert = `---
title: SQL Insert
---

## Upserts and conflicts

MySQL has no conflict clause. Use \`.onDuplicateKeyUpdate()\` for an upsert.
`;

const release = `---
title: Release notes
---

## Upserts

This release adds upsert conflict targets.
`;

const bigPart = 'Drizzle splits a long guide into parts that an agent can read one by one. '.repeat(70);
const bigPage = `---
title: Big guide
description: A long guide
---

The intro of the big guide.

## Part one

${bigPart}

## Part two

The second part of the guide. ${bigPart}

## ✅

A heading with no letters.
`;

let root: string;
let index: DocsIndex;

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'drizzle-docs-'));
	const files: Record<string, string> = {
		'src/content/docs/pg/insert.mdx': pgInsert,
		'src/content/docs/mysql/insert.mdx': mysqlInsert,
		'src/content/docs/latest-releases/drizzle-orm-v100.mdx': release,
		'src/content/docs/guides/big-guide.mdx': bigPage,
		'src/mdx/UpsertNote.mdx': 'An upsert inserts a row or updates the row that conflicts.',
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	await writeDocsIndex(root, join(root, 'index'));
	index = loadDocsIndex(join(root, 'index'));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

test('search returns hits of the requested dialect only', async () => {
	const pgIds = (await searchDocs(index, 'upsert conflict', { dialect: 'pg' })).map((hit) => hit.id);
	const mysqlIds = (await searchDocs(index, 'upsert conflict', { dialect: 'mysql' })).map((hit) => hit.id);

	expect(pgIds.some((id) => id.startsWith('pg/insert'))).toBe(true);
	expect(pgIds.some((id) => id.startsWith('mysql/'))).toBe(false);
	expect(mysqlIds.some((id) => id.startsWith('mysql/insert'))).toBe(true);
	expect(mysqlIds.some((id) => id.startsWith('pg/'))).toBe(false);
});

test('search leaves out release notes', async () => {
	const hits = await searchDocs(index, 'upsert conflict targets');

	expect(hits.length).toBeGreaterThan(0);
	expect(hits.some((hit) => hit.id.startsWith('latest-releases/'))).toBe(false);
});

test('a search hit points at the section that matches', async () => {
	const [hit] = await searchDocs(index, 'target columns', { dialect: 'pg' });

	expect(hit).toStrictEqual({ id: 'pg/insert#target-columns', title: 'SQL Insert', description: expect.any(String) });
});

test('search prints one hit per line as plain text', async () => {
	const hits = await searchDocs(index, 'upsert conflict', { dialect: 'pg' });
	const lines = formatDocsHits(hits, 'upsert conflict').split('\n');

	expect(lines).toHaveLength(hits.length);
	expect(lines).toContain('pg/insert#upserts-and-conflicts  SQL Insert: Drizzle inserts rows with db.insert().');
});

test('search prints a long description on one shortened line', () => {
	const text = formatDocsHits([{ id: 'pg/a', title: 'A', description: 'Many\nwords '.repeat(60) }], 'a');

	expect(text).not.toContain('\n');
	expect(text).toMatch(/^pg\/a {2}A: Many words .*\.\.\.$/);
	expect(text.length).toBeLessThan(180);
});

test('search with no hits says so and suggests other words', async () => {
	const hits = await searchDocs(index, 'kubernetes helm', { dialect: 'pg' });

	expect(formatDocsHits(hits, 'kubernetes helm')).toBe(
		'No docs match "kubernetes helm". Try other words or fewer words.',
	);
});

test('retrieve returns a #### section without the rest of the page', () => {
	const text = retrieveDoc(index, 'pg/insert#target-columns');

	expect(text).toContain('#### Target columns');
	expect(text).not.toContain('onConflictDoNothing');
	expect(text).not.toContain('## Returning');
});

test('retrieve returns a ## section with its sub-sections', () => {
	const text = retrieveDoc(index, 'pg/insert#upserts-and-conflicts');

	expect(text).toContain('An upsert inserts a row or updates the row that conflicts.');
	expect(text).toContain('### On conflict do nothing');
	expect(text).toContain('#### Target columns');
	expect(text).not.toContain('## Returning');
});

test('retrieve keeps code fences and removes JSX', () => {
	const text = retrieveDoc(index, 'pg/insert');

	expect(text).toContain('# this line is inside a code fence and is not a heading\nawait db.insert(users)');
	expect(text).toContain('Drizzle inserts rows with `db.insert()`.');
	expect(text).not.toContain('<Callout');
	expect(text).not.toContain('<UpsertNote');
});

test('retrieve of a large page returns the intro and a section list', () => {
	const text = retrieveDoc(index, 'guides/big-guide');

	expect(text).toContain('The intro of the big guide.');
	expect(text).toContain('- guides/big-guide#part-two  Part two');
	expect(text).toContain('- guides/big-guide#section  ✅');
	expect(text).not.toContain('The second part of the guide.');
});

test('retrieve of a large page with full returns the whole page', () => {
	const text = retrieveDoc(index, 'guides/big-guide', { full: true });

	expect(text).toContain('The second part of the guide.');
	expect(text).not.toContain('## Sections');
});

test('retrieve of an unknown id or section names what exists', () => {
	expect(() => retrieveDoc(index, 'pg/update')).toThrow(
		"No docs page has the id 'pg/update'. Run 'drizzle-kit docs search' to find an id.",
	);
	expect(() => retrieveDoc(index, 'pg/insert#delete')).toThrow(
		"The page 'pg/insert' has no section 'delete'. Its sections are: insert-one-row, upserts-and-conflicts, "
			+ 'on-conflict-do-nothing, target-columns, returning',
	);
});

test('a build without a docs index reports it', () => {
	expect(() => loadDocsIndex(join(root, 'missing'))).toThrow('This drizzle-kit build has no docs index.');
});

test('search takes the dialect from the drizzle config', async () => {
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX;
	process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';
	try {
		const fromConfig = await brotest(docsSearch, 'upsert');
		const fromFlag = await brotest(docsSearch, 'upsert --dialect=turso');
		const noConfig = await brotest(docsSearch, 'upsert --config=missing.config.ts');
		if (fromConfig.type !== 'handler' || fromFlag.type !== 'handler' || noConfig.type !== 'handler') {
			assert.fail('expected the handler to run');
		}

		expect(fromConfig.options).toStrictEqual({ query: 'upsert', dialect: 'pg' });
		expect(fromFlag.options).toStrictEqual({ query: 'upsert', dialect: 'sqlite' });
		expect(noConfig.options).toStrictEqual({ query: 'upsert', dialect: undefined });
	} finally {
		process.env.TEST_CONFIG_PATH_PREFIX = prefix;
	}
});
