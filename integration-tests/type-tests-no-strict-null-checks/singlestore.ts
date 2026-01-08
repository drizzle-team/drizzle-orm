// oxlint-disable no-unused-expressions
import { drizzle } from 'drizzle-orm/singlestore';
import { singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { type Equal, Expect } from './utils.ts';

export const test = singlestoreTable(
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

// Enable after `.generatedAlwaysAs()` is implemented
// db.update(test)
// 	.set({
// 		// @ts-expect-error
// 		id: '1',
// 		name: 'name',
// 		title: 'title',
// 		description: 'desc',
// 		dbdef: 'upddef',
// 	});

db.update(test)
	.set({
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

// Enable after `.generatedAlwaysAs()` is implemented
// db.insert(test).values({
// 	// @ts-expect-error
// 	id: '1',
// 	name: 'name',
// 	title: 'title',
// 	description: 'desc',
// 	dbdef: 'upddef',
// });

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
