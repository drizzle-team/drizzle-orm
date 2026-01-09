// oxlint-disable no-unused-expressions
import { drizzle } from 'drizzle-orm/gel';
import { gelTable, integer, text } from 'drizzle-orm/gel-core';
import { type Equal, Expect } from './utils.ts';

export const test = gelTable(
	'test',
	{
		id: text('id')
			.primaryKey()
			.generatedAlwaysAs('genstr'),
		intId: integer('int_id')
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		int2Id: integer('int2_id').generatedByDefaultAsIdentity(),
		name: text('name').$defaultFn(() => '' as string),
		title: text('title').notNull(),
		description: text('description'),
		dbdef: text('dbdef').default('dbdefval'),
	},
);

const db = drizzle.mock();

Expect<
	Equal<typeof test['$inferSelect'], {
		id: string;
		intId: number;
		int2Id: number;
		name: string;
		title: string;
		description: string;
		dbdef: string;
	}>
>;

Expect<
	Equal<typeof test['$inferInsert'], {
		title: string;
		int2Id?: number;
		name?: string;
		description?: string;
		dbdef?: string;
	}>
>;

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
		// @ts-expect-error
		intId: 1,
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		int2Id: 1,
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
	// @ts-expect-error
	intId: 1,
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	int2Id: 1,
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
