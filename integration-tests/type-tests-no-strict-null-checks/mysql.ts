// oxlint-disable no-unused-expressions
import { mysqlTable, text } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import { type Equal, Expect } from './utils.ts';

export const test = mysqlTable(
	'test',
	{
		id: text('id')
			.primaryKey()
			.generatedAlwaysAs('genstr'),
		name: text('name').$defaultFn(() => '' as string),
		title: text('title').notNull(),
		description: text('description'),
		dbdef: text('dbdef').default('dbdefval'),
	},
);

Expect<
	Equal<typeof test['$inferSelect'], {
		id: string;
		name: string;
		title: string;
		description: string;
		dbdef: string;
	}>
>;

Expect<
	Equal<typeof test['$inferInsert'], {
		title: string;
		name?: string;
		description?: string;
		dbdef?: string;
	}>
>;

const db = drizzle.mock();

db.update(test)
	.set({
		// @ts-expect-error
		id: '1',
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.insert(test).values({
	// @ts-expect-error
	id: '1',
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	title: 'title',
	description: 'desc',
});

db.insert(test).values({
	title: 'title',
});
