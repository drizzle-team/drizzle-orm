import { index, integer, pgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// Regression for https://github.com/drizzle-team/drizzle-orm/issues/6045
// When a column that belongs to an index is dropped, the index must be dropped
// before the column. Postgres implicitly drops an index together with a column
// it references, so a later explicit `DROP INDEX` fails with error 42704.

let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase(false);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('#6045: index is dropped before the columns it references', async () => {
	const schema1 = {
		notesToTags: pgTable('notes_to_tags', {
			noteId: integer('note_id').notNull(),
			tagAuthorId: integer('tag_author_id').notNull(),
			tagName: integer('tag_name').notNull(),
		}, (t) => [
			index('notes_to_tags_tag_idx').on(t.tagAuthorId, t.tagName),
		]),
	};
	const schema2 = {
		notesToTags: pgTable('notes_to_tags', {
			noteId: integer('note_id').notNull(),
			tagId: integer('tag_id').notNull(),
		}, (t) => [
			index('notes_to_tags_tag_idx').on(t.tagId),
		]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);
	// eslint-disable-next-line no-console
	console.log('SQL:\n' + sqlStatements.map((s, i) => `${i}: ${s}`).join('\n'));

	const dropIndex = sqlStatements.findIndex((s) => s.includes('DROP INDEX'));
	const dropColumn = sqlStatements.findIndex((s) => s.includes('DROP COLUMN'));

	expect(dropIndex, 'expected a DROP INDEX statement').toBeGreaterThanOrEqual(0);
	expect(dropColumn, 'expected a DROP COLUMN statement').toBeGreaterThanOrEqual(0);
	expect(dropIndex, 'DROP INDEX must come before DROP COLUMN').toBeLessThan(dropColumn);

	// Applying the migration against a real Postgres must not raise error 42704.
	await push({ db, to: schema1 });
	await push({ db, to: schema2 });
});
