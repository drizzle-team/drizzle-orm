import { PGlite } from '@electric-sql/pglite';
import { integer, pgDomain, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, test } from 'vitest';
import { seed } from '../../src/index.ts';

test('seed domain columns', async () => {
	const email = pgDomain('email_d', varchar({ length: 60 }).notNull());
	const age = pgDomain('age_d', integer());
	const ts = pgDomain('ts_d', timestamp());
	const nested = pgDomain('nested_d', age());
	const tags = pgDomain('tags_d', text().array());
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
		email: email('email'),
		age: age('age'),
		at: ts('at'),
		name: text('name'),
		nested: nested('nested'),
		tags: tags('tags'),
		ages: age('ages').array(),
	});
	const client = new PGlite();
	await client.exec(
		`create domain email_d as varchar(60) not null; create domain age_d as integer; create domain ts_d as timestamp; create domain nested_d as age_d; create domain tags_d as text[]; create table users (id integer primary key, email email_d, age age_d, at ts_d, name text, nested nested_d, tags tags_d, ages age_d[]);`,
	);
	const db = drizzle(client);
	// domain columns are seeded with generators for the type they wrap
	await seed(db, { users }, { count: 5 });
	const rows = await db.select().from(users);
	expect(rows).toHaveLength(5);
	for (const row of rows) {
		expect(typeof row.email).toBe('string');
		expect(row.email).toContain('@');
		expect(Number.isInteger(row.age)).toBe(true);
		expect(row.at).toBeInstanceOf(Date);
		expect(Number.isInteger(row.nested)).toBe(true);
		expect(Array.isArray(row.tags)).toBe(true);
		expect(Array.isArray(row.ages)).toBe(true);
		expect(row.ages!.every((v) => Number.isInteger(v))).toBe(true);
	}
});
